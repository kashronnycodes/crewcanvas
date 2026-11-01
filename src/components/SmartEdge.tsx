import { memo, useRef } from "react";
import {
  BaseEdge,
  type EdgeProps,
  Handle,
  Position,
  useInternalNode,
} from "@xyflow/react";
import { type Route, routeConnection } from "../../shared/edge-routing";

export const FourWayHandles = memo(function FourWayHandles() {
  return (
    <>
      {[Position.Top, Position.Bottom, Position.Left, Position.Right].map(
        (position) => (
          <Handle
            key={position}
            id={position}
            type="source"
            position={position}
          />
        ),
      )}
    </>
  );
});
export const SmartEdge = memo(function SmartEdge(props: EdgeProps) {
  const source = useInternalNode(props.source),
    target = useInternalNode(props.target),
    previous = useRef<Route | undefined>(undefined);
  if (
    !source || !target || !source.measured.width || !source.measured.height ||
    !target.measured.width || !target.measured.height
  ) return null;
  const route = routeConnection({
    ...source.internals.positionAbsolute,
    width: source.measured.width,
    height: source.measured.height,
  }, {
    ...target.internals.positionAbsolute,
    width: target.measured.width,
    height: target.measured.height,
  }, previous.current);
  previous.current = route;
  return (
    <BaseEdge
      id={props.id}
      path={route.path}
      style={props.style}
      markerStart={props.markerStart}
      markerEnd={props.markerEnd}
      interactionWidth={props.interactionWidth}
      label={props.label}
      labelX={route.labelX}
      labelY={route.labelY}
      labelStyle={props.labelStyle}
      labelShowBg={props.labelShowBg}
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
    />
  );
});
export const smartEdgeTypes = { default: SmartEdge };
