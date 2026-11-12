import {z} from "zod";
export const judgeWorkspaceId="b00f4462-5c6f-45ec-b1fb-a0d7c2895a72";
export const judgeIdentities={
  employer:"crewcanvas.employer.1793461807178@example.com",
  freelancer:"crewcanvas.freelancer.1793461807178@example.com",
} as const;
export const judgeRequest=z.object({role:z.enum(["employer","freelancer"]),code:z.string().min(1).max(160)}).strict();
export type JudgeRole=keyof typeof judgeIdentities;
export async function sha256(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function judgeCodeMatches(code:string,expected:string):Promise<boolean>{
  if(!/^[a-f0-9]{64}$/.test(expected))return false;
  const actual=await sha256(code);let difference=0;
  for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return difference===0;
}
