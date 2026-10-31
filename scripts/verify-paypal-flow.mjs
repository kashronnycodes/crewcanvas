// A $1.25 Sandbox invoice for synthetic work. Payment authorization remains manual.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { testSession } from "./test-session.mjs";
const path = new URL("../.supabase/paypal-flow.json", import.meta.url);
const owner = await testSession(0), worker = await testSession(1);
let state = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : { workspaceId: owner.fixtures.workspaceId, createRequestId: randomUUID() };
assert.equal(
  state.workspaceId,
  owner.fixtures.workspaceId,
  "Only the labeled integration workspace is allowed.",
);
const save = () => writeFileSync(path, JSON.stringify(state, null, 2));
const getProject = async () => {
  const snapshot = await owner.request("snapshot");
  const project = snapshot.projects.find((p) => p.id === state.projectId);
  assert.ok(project, "Sandbox verification project missing");
  assert.equal(project.title, "Synthetic Sandbox paid revision");
  return project;
};
try {
  if (process.argv.includes("--verify")) {
    assert.ok(state.projectId);
    await owner.request("payments/reconcile", { projectId: state.projectId });
    const p = await getProject(),
      i = p.invoices.find((i) => i.id === state.invoiceId);
    assert.ok(i);
    state.invoiceState = i.state;
    state.paidMinor = i.paidMinor;
    state.verifiedAt = new Date().toISOString();
    save();
    console.log(
      JSON.stringify({
        environment: "sandbox",
        invoiceState: i.state,
        amountMinor: i.amountMinor,
        paidMinor: i.paidMinor,
        pendingMinor: i.pendingMinor,
        workState: p.state,
      }),
    );
  } else {
    if (!state.projectId) {
      save();
      const snapshot = await owner.request("snapshot");
      const freelancer = snapshot.people.find((p) =>
        p.accessRole === "worker" &&
        p.authUserId === owner.fixtures.accounts[1].id
      );
      assert.ok(freelancer);
      const result = await owner.request(
        "command",
        {
          type: "createProject",
          workerId: freelancer.id,
          title: "Synthetic Sandbox paid revision",
          publish: true,
          terms: {
            brief:
              "SYNTHETIC SANDBOX VERIFICATION: design one test card. Correct spelling errors. A second concept is excluded.",
            tasks: ["Design one synthetic card"],
            deliverables: ["Synthetic card reference"],
            amountMinor: "100",
            currency: "USD",
            deadline: "2026-12-20",
            revisionRounds: 2,
            paymentDays: 7,
          },
        },
        owner.fixtures.workspaceId,
        state.createRequestId,
      );
      state.projectId = result.projectId;
      save();
    }
    let p = await getProject();
    if (p.state === "awaiting_agreement") {
      await worker.request("command", {
        type: "decideAgreement",
        projectId: p.id,
        agreementId: p.agreements[0].id,
        accept: true,
      });
      p = await getProject();
    }
    if (!p.deliveries.length) {
      await worker.request("command", {
        type: "submitDelivery",
        projectId: p.id,
        url:
          "https://drive.google.com/file/d/crewcanvas-synthetic-reference/view",
        label: "Synthetic v1",
        note: "Synthetic test reference only; no real client work.",
      });
      p = await getProject();
    }
    if (!p.revisions.length) {
      await owner.request("command", {
        type: "requestRevision",
        projectId: p.id,
        text: "Correct the heading spelling and add a second concept.",
        items: [{
          text: "Correct the heading spelling.",
          classification: "likely_included",
          explanation: "Synthetic included correction.",
          uncertainty: "high",
          sources: [],
        }, {
          text: "Add a second concept.",
          classification: "potential_extra",
          explanation: "Synthetic extra-work request.",
          uncertainty: "high",
          sources: [],
        }],
      });
      p = await getProject();
    }
    const revision = p.revisions[0];
    if (revision.items[0].disposition === "awaiting_response") {
      await worker.request("command", {
        type: "respondRevision",
        projectId: p.id,
        revisionId: revision.id,
        itemId: revision.items[0].id,
        disposition: "included",
        note: "Included in the original synthetic scope.",
        waiveRound: false,
      });
      p = await getProject();
    }
    if (!p.proposals.length) {
      await worker.request("command", {
        type: "proposeAddition",
        projectId: p.id,
        revisionId: revision.id,
        itemId: revision.items[1].id,
        description: "One additional synthetic concept",
        amountMinor: "25",
        deadline: null,
      });
      p = await getProject();
    }
    if (p.proposals[0].status === "pending") {
      await owner.request("command", {
        type: "decideProposal",
        projectId: p.id,
        proposalId: p.proposals[0].id,
        accept: true,
      });
      p = await getProject();
    }
    assert.equal(
      p.agreements.find((a) => a.id === p.activeAgreementId).amountMinor,
      "125",
    );
    if (!p.deliveries.some((d) => d.label === "Synthetic v2")) {
      await worker.request("command", {
        type: "submitDelivery",
        projectId: p.id,
        url:
          "https://drive.google.com/file/d/crewcanvas-synthetic-reference-v2/view",
        label: "Synthetic v2",
        note: "Synthetic corrected card and accepted additional concept.",
      });
      p = await getProject();
    }
    if (p.state !== "accepted") {
      await owner.request("command", {
        type: "acceptDelivery",
        projectId: p.id,
        deliveryId: p.deliveries.at(-1).id,
      });
      p = await getProject();
    }
    if (process.argv.includes("--prepare-only")) {
      state.workflowReady = true;
      save();
      console.log(
        "PASS synthetic free correction and paid revision: both accepted, total USD 1.25, work approved. No invoice or payment was created.",
      );
    } else {
      if (!state.issueRequestId) {
        state.issueRequestId = randomUUID();
        save();
      }
      if (!p.invoices.length || !p.invoices[0].recipientUrl) {
        const result = await worker.request(
          "payments/issue",
          { projectId: p.id },
          owner.fixtures.workspaceId,
          state.issueRequestId,
        );
        state.invoiceId = result.invoiceId;
        p = await getProject();
      }
      const invoice = p.invoices.find((i) => i.id === state.invoiceId) ??
        p.invoices[0];
      assert.ok(invoice);
      assert.equal(invoice.amountMinor, "125");
      assert.equal(invoice.source, "sandbox");
      assert.equal(new URL(invoice.recipientUrl).protocol, "https:");
      assert.ok(
        ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(
          new URL(invoice.recipientUrl).hostname,
        ),
      );
      Object.assign(state, {
        invoiceId: invoice.id,
        providerId: invoice.providerId,
        recipientUrl: invoice.recipientUrl,
        invoiceState: invoice.state,
        amountMinor: invoice.amountMinor,
      });
      save();
      console.log(
        JSON.stringify({
          environment: "sandbox",
          amount: "USD 1.25",
          workState: p.state,
          invoiceState: invoice.state,
          paymentUrl: invoice.recipientUrl,
        }),
      );
    }
  }
} finally {
  await owner.close();
  await worker.close();
}
