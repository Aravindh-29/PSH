---
name: project-psh-ui-design
description: "Pure Storage Horizon UI design spec - exact color scheme, layout, components from approved mockups"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7be858f0-1fe3-44f0-9408-2c45405b5259
  modified: 2026-08-19T15:48:09.678Z
---

UI approved by user from provided mockup images. Must match exactly.

**Why:** User explicitly showed mockup images and said "I want exactly same UI"

**How to apply:** All frontend components must follow this design spec precisely.

## Color Palette
- Sidebar background: Dark navy #0D1B2A (very dark blue)
- Primary accent / CTA: Orange #E85D04 (Pure Storage brand orange)
- Active sidebar item: Slightly lighter navy with orange left border
- Content background: White #FFFFFF
- Card background: White with subtle border/shadow
- Text primary: Dark navy #0D1B2A
- Text secondary: Gray #6B7280

## Login Page (split-screen)
- Left half: Dark navy gradient with animated particle/wave background (CSS or canvas)
- Pure Storage orange hexagon logo top-left
- "Welcome to Pure Storage Horizon" — "Pure Storage Horizon" in orange
- "Enterprise Ticketing Platform" subtitle
- Orange horizontal rule decoration
- Shield icon with tagline "Secure. Reliable. Built for Performance."
- Right half: White card (rounded, shadow)
- Orange shield icon in circle at top
- "Sign in to your account" heading
- Username or Email field with person icon
- Password field with lock icon + eye toggle
- Remember me checkbox + Forgot password? (orange link)
- Big orange "Sign In" button with lock icon
- OR divider
- "Sign in with SSO" outlined button
- Copyright footer

## Dashboard Layout
- Left sidebar ~210px: Logo top, nav items (Dashboard, Tickets▸, My Tickets, Create Ticket, Knowledge Base, Reports▸, Users, Admin▸, Audit Logs, Settings), user profile bottom
- Top bar: hamburger, global search (Ctrl+K), notification bell with badge, user avatar + name + role
- Main content header: "Welcome back, [Name]! 👋", date range picker, orange "+ Create New Ticket" button
- 6 stat cards in a row: Total Tickets, Open, In Progress, Pending, Resolved, Closed — each with icon, number, % change (green up/red down), mini sparkline
- Middle row: Tickets Overview line chart (left 60%), Tickets by Priority donut chart (middle 25%), Quick Actions + SLA Breaches + Announcements (right 15%)
- Bottom: Recent Tickets table with columns: Ticket ID, Subject, Customer, Priority badge, Status badge, Assigned To (avatar+name), Updated, Actions

## Status Badges (pill shape, colored background)
- Open: green
- In Progress: blue
- Pending: yellow/amber
- Resolved: teal
- Closed: gray

## Priority Badges (pill shape)
- Critical: dark red
- High: orange/red
- Medium: yellow/amber
- Low: green

## Charts
- Line chart: Recharts or Chart.js, multiple colored lines per status
- Donut chart: Recharts PieChart, colors: Critical=red, High=orange, Medium=yellow/gold, Low=green
