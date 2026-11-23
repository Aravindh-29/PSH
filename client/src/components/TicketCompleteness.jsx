import React from 'react';
export default function TicketCompleteness({ticket}){
 if(!ticket?.details_incomplete)return null;
 return <aside className="ticket-incomplete-banner" role="status"><strong>Details incomplete{ticket.routing_needs_review?' · Needs routing':''}</strong><p>Missing: {(ticket.missing_details||[]).map(field=>field.label).join(', ')}. Fill these details when available.</p>{ticket.routing_needs_review&&<p>{ticket.assigned_to?'Assigned for Admin review.':'Waiting in the Admin Needs routing queue.'} Admin can route this email ticket to the correct department or sub department.</p>}</aside>;
}
