import type {Person} from "../../shared/types";
import Avatar from "./Avatar";
import Modal from "./Modal";
export default function MemberInfo({person,role,onClose}:{person:Pick<Person,"id"|"name"|"color"|"role">;role?:string;onClose:()=>void}){
  return <Modal title={person.name} onClose={onClose}>
    <div className="member-info"><Avatar person={person} size={52}/><div><span className="fine-print">Project role</span><p>{role??person.role}</p></div></div>
  </Modal>;
}
