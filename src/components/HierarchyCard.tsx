import { Handle,Position } from "@xyflow/react";
import { ArrowRight,Users } from "lucide-react";
import type { HierarchyCard } from "../../shared/workflow";
import Avatar from "./Avatar";

export default function HierarchyCardView({ card }: { card: HierarchyCard }) {
  return (
    <article className={`hierarchy-card hierarchy-${card.kind}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        isConnectable={false}
      />
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={false}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
      />
      <small>
        {card.kind === "roles"
          ? "ROLES"
          : card.kind.toUpperCase()}
      </small>
      <button className="nodrag" onClick={card.onOpen}>
        {card.person && <Avatar person={card.person} size={28} />}
        {card.kind === "roles" && <Users size={19} />}
        <strong>{card.title}{card.person?.sample && <small className="sample-member-label">Sample</small>}</strong>
        <ArrowRight size={15} />
      </button>
      <p>{card.caption}</p>
    </article>
  );
}
