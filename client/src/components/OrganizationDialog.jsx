import React,{useEffect,useRef} from 'react';
export default function OrgDialog({children,title,onClose,className=''}) {
 const ref=useRef();
 useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>{if(dialog.open)dialog.close()}},[]);
 return <dialog className={'org-dialog '+className} ref={ref} aria-label={title} onCancel={event=>{event.preventDefault();onClose()}}>{children}</dialog>;
}
