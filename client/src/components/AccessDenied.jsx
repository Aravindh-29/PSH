import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
export default function AccessDenied() {
  const navigate=useNavigate();
  return <section role="alert" style={{maxWidth:700,margin:'60px auto',padding:40,textAlign:'center',background:'white',border:'1px solid #dbe3ed',borderRadius:12}}>
    <ShieldAlert size={52} style={{color:'var(--orange)',marginBottom:20}} />
    <h1>Access denied</h1><p style={{margin:'20px 0'}}>You don't have permission to access this page.</p><p style={{color:'#64748b'}}>Contact your administrator if you need access.</p>
    <div style={{display:'flex',justifyContent:'center',gap:12,marginTop:26}}><button className="cfg-btn-cancel" onClick={()=>navigate(-1)}>Go Back</button><Link to="/" className="cfg-btn-save">Back to Dashboard</Link></div>
  </section>;
}
