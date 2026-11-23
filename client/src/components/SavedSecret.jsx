import React,{useState} from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
export default function SavedSecret({label,saved,value='',onChange,kind,provider,editable=true}){
 const [editing,setEditing]=useState(false),[copying,setCopying]=useState(false);
 const masked=saved&&!editing&&!value;
 const copy=async()=>{setCopying(true);try{const secret=value||(await api.post('/config/admin/mcp/credentials/copy',{kind,provider})).data.secret;await navigator.clipboard.writeText(secret);toast.success('Credential copied.');}catch{toast.error('Could not copy the credential. Please retry.');}finally{setCopying(false);}};
 return <div className="mcp-secret-field"><label>{label}{saved&&<span className="mcp-saved-label">Saved securely</span>}<input aria-label={label} type="password" autoComplete="new-password" readOnly={masked||!editable} required={editable&&!saved} value={masked?'••••••••••••••••••••••••':value} onChange={e=>onChange?.(e.target.value)}/></label><div className="mcp-secret-actions">{(saved||value)&&<button type="button" className="mcp-secondary" disabled={copying} onClick={copy}>{copying?'Copying…':'Copy'}</button>}{editable&&saved&&<button type="button" className="mcp-secondary" onClick={()=>{onChange?.('');setEditing(!editing);}}>{editing?'Keep saved key':'Replace'}</button>}</div></div>;
}
