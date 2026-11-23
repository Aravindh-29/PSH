import React from 'react';
import {splitEmailComment} from '../utils/emailComment';
import {fmt} from '../utils/dateUtils';
export default function EmailCommentBody({comment}){
 const {reply}=splitEmailComment(comment.body);
 return <>
  <div className="email-comment-meta">
   <div><span className="email-comment-label">Incoming email</span><strong>{comment.email_sender}</strong><span>Received {fmt(comment.email_received_at)}</span></div>
   {comment.email_gmail_url&&<a href={comment.email_gmail_url} target="_blank" rel="noopener noreferrer">Open original email ↗</a>}
  </div>
  <div className="ct-body email-comment-reply">{reply}</div>
 </>;
}
