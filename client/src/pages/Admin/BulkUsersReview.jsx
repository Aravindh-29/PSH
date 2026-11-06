import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Eye, EyeOff, FileSpreadsheet, LockKeyhole, Search, ShieldCheck, Upload, Users, X } from 'lucide-react';
import './BulkUsersReview.css';

export default function BulkUsersReview({ rows, setRows, roles, fileName, busy, canCreate, onBack, onUpload, onCreate }) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const dialog = useRef(null);
  const passwordInput = useRef(null);
  const submitting = useRef(false);
  const selectAll = useRef(null);
  const ready = rows.filter(row => !row.errors.length);
  const selected = ready.filter(row => row.selected);
  const roleName = key => roles.find(item => item.key === key)?.name || key;
  const roleOptions = [...new Map([...roles, ...rows.map(row => ({ key: row.role, name: roleName(row.role) }))].map(item => [item.key, item])).values()];
  const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) =>
    (!role || row.role === role) &&
    (!status || (status === 'ready' && !row.errors.length) || (status === 'errors' && row.errors.length) || (status === 'selected' && row.selected)) &&
    (!search || [row.fullName, row.username, row.email, roleName(row.role), ...row.groups, ...row.managedGroups].join(' ').toLowerCase().includes(search.toLowerCase())));
  const selectable = visible.filter(({ row }) => !row.errors.length);
  const allChecked = selectable.length > 0 && selectable.every(({ row }) => row.selected);

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = !allChecked && selectable.some(({ row }) => row.selected);
  }, [allChecked, selectable]);
  useEffect(() => {
    if (confirming && !dialog.current.open) { dialog.current.showModal(); passwordInput.current?.focus(); }
  }, [confirming]);

  const closeConfirmation = () => {
    if (busy) return;
    dialog.current?.close(); setConfirming(false); setPassword(''); setShowAdminPassword(false); setError('');
  };
  const create = async event => {
    event.preventDefault();
    if (submitting.current || busy || !password || !selected.length || !canCreate) return;
    submitting.current = true;
    // Results keep account metadata only. Imported passwords are cleared by the parent.
    const accounts = selected.map(({ password: omitted, errors, selected: checked, ...row }) => row);
    try {
      setError('');
      const response = await onCreate(password);
      setResult({ ...response, accounts }); setPassword(''); setShowPasswords(false); setRevealed({});
      dialog.current.close(); setConfirming(false); setShowAdminPassword(false);
    } catch (failure) { setError(failure.response?.data?.message || 'The import could not be completed. Check your password and try again.'); }
    finally { submitting.current = false; }
  };
  const uploadButton = label => <label className="cfg-btn-cancel rbac-upload"><Upload size={16}/>{label}<input aria-label={label} className="rbac-file-input" type="file" accept=".xlsx" disabled={busy} onChange={onUpload}/></label>;

  return <div className="admin-page rbac bulk-users">
    <div className="rbac-heading">
      <div><span className="rbac-eyebrow">PEOPLE & ACCESS / BULK IMPORT</span><h1>{result ? 'User import results' : 'Review your user import'}</h1><p>{result ? 'See which accounts were created and which rows need attention.' : 'Review account details and access before creating your users.'}</p></div>
      <div className="rbac-actions"><button className="cfg-btn-cancel" disabled={busy} onClick={onBack}><ArrowLeft size={16}/>Back to Users</button>{uploadButton(result ? 'Upload another file' : 'Replace Excel file')}</div>
    </div>
    <ol className="bulk-steps" aria-label="Import progress">
      {['Upload Excel', 'Review users', 'Confirm access', 'Import results'].map((label, index) => {
        const current = result ? 3 : confirming ? 2 : 1;
        return <li key={label} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''} aria-current={index === current ? 'step' : undefined}><span>{index < current ? <Check size={14}/> : index + 1}</span>{label}</li>;
      })}
    </ol>
    <div className="bulk-file"><span className="bulk-file-icon"><FileSpreadsheet size={22}/></span><div><strong title={fileName}>{fileName}</strong><span>Excel workbook · {result ? result.accounts.length : rows.length} account rows</span></div><span className="bulk-file-status"><CheckCircle2 size={15}/>{result ? 'Import processed' : 'File checked'}</span></div>
    <div className="rbac-stats bulk-stats">
      {(result ? [
        [Users, 'Submitted users', result.accounts.length, 'Accounts included in this import', 'blue'],
        [CheckCircle2, 'Created successfully', result.created, 'New accounts are ready', 'green'],
        [CircleAlert, 'Not created', result.failed.length, 'Review the reasons below', 'amber'],
      ] : [
        [Users, 'Total rows', rows.length, 'Accounts in your Excel file', 'blue'],
        [CheckCircle2, 'Ready to import', ready.length, 'Passed the preview checks', 'green'],
        [CircleAlert, 'Needs attention', rows.length - ready.length, 'Fix these rows in your workbook', 'amber'],
        [ShieldCheck, 'Selected users', selected.length, 'Accounts you will create', 'orange'],
      ]).map(([Icon, label, count, note, color]) => <div className={'rbac-stat bulk-stat-' + color} key={label}><span className="rbac-stat-icon"><Icon size={21}/></span><div><span>{label}</span><strong>{count}</strong><small>{note}</small></div></div>)}
    </div>

    {result ? <section className="rbac-card rbac-table-wrap bulk-preview">
      <div className="rbac-section-title"><div><h3>{result.failed.length ? 'Import completed with issues' : 'Your users have been created'}</h3><p>{result.failed.length ? 'Correct the unsuccessful rows in Excel and upload those rows again.' : 'You can now find these accounts in User Management.'}</p></div><CheckCircle2 size={24}/></div>
      <table className="cfg-table"><thead><tr><th scope="col">User</th><th scope="col">Username</th><th scope="col">Role</th><th scope="col">Result</th></tr></thead><tbody>{result.accounts.map((row, index) => {
        const failed = result.failed.find(item => item.username === row.username);
        return <tr key={index}><td><strong>{row.fullName}</strong><span className="bulk-secondary">{row.email}</span></td><td><code>{row.username}</code></td><td><span className="rbac-status">{roleName(row.role)}</span></td><td><span className={'bulk-validation ' + (failed ? 'has-errors' : 'is-ready')}>{failed ? <CircleAlert size={15}/> : <CheckCircle2 size={15}/>}{failed ? failed.reason : 'Created successfully'}</span></td></tr>;
      })}</tbody></table>
    </section> : <>
      <div className="rbac-toolbar bulk-toolbar"><Search size={18}/><input aria-label="Search import users" placeholder="Search name, username, email or group…" value={search} onChange={event => setSearch(event.target.value)}/><select aria-label="Filter import by role" value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option>{roleOptions.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select><select aria-label="Filter import by validation" value={status} onChange={event => setStatus(event.target.value)}><option value="">All rows</option><option value="ready">Ready to import</option><option value="errors">Needs attention</option><option value="selected">Selected users</option></select><button className="cfg-btn-cancel" aria-pressed={showPasswords} onClick={() => { setShowPasswords(!showPasswords); setRevealed({}); }}>{showPasswords ? <EyeOff size={16}/> : <Eye size={16}/>} {showPasswords ? 'Hide passwords' : 'Show passwords'}</button></div>
      <section className="rbac-card rbac-table-wrap bulk-preview">
        <div className="rbac-section-title"><div><h3>User preview</h3><p>Only selected rows that pass validation will be created.</p></div><span>{visible.length} of {rows.length} rows</span></div>
        <div className="bulk-table-scroll"><table className="cfg-table"><thead><tr><th scope="col"><input ref={selectAll} aria-label="Select all visible valid users" type="checkbox" checked={allChecked} disabled={busy || !selectable.length} onChange={event => { const indexes = new Set(selectable.map(item => item.index)); const checked = event.target.checked; setRows(previous => previous.map((row, index) => indexes.has(index) ? { ...row, selected: checked } : row)); }}/></th><th scope="col">User</th><th scope="col">Username</th><th scope="col">Role</th><th scope="col">Groups / Managed groups</th><th scope="col">MFA</th><th scope="col">Password</th><th scope="col">Validation</th></tr></thead><tbody>
          {visible.map(({ row, index }) => <tr key={index} className={row.errors.length ? 'bulk-row-error' : row.selected ? 'bulk-row-selected' : ''}>
            <td><input aria-label={'Select import row ' + (index + 1)} type="checkbox" checked={row.selected} disabled={busy || !!row.errors.length} onChange={event => { const checked = event.target.checked; setRows(previous => previous.map((item, position) => position === index ? { ...item, selected: checked } : item)); }}/></td>
            <td><div className="rbac-identity"><span className="rbac-avatar">{row.fullName?.slice(0, 1).toUpperCase() || '?'}</span><div><strong>{row.fullName || 'Missing name'}</strong><span className="bulk-secondary">{row.email || 'Missing email'}</span></div></div><span className="bulk-row-number">Excel row {row.sourceRow || index + 2}</span></td>
            <td><code>{row.username || '—'}</code></td><td><span className="rbac-status">{roleName(row.role)}</span></td>
            <td><div className="bulk-group-tags">{row.groups.length ? row.groups.map(name => <span key={name}>{name}</span>) : <span className="bulk-muted">No member groups</span>}</div>{row.managedGroups.length > 0 && <span className="bulk-secondary">Manages: {row.managedGroups.join(', ')}</span>}</td>
            <td><span className={'rbac-badge ' + (row.mfaRequired ? 'is-active' : 'is-inactive')}><ShieldCheck size={12}/>{row.mfaRequired ? 'Required' : 'Off'}</span></td>
            <td><div className="bulk-row-password"><code>{row.password ? (showPasswords !== !!revealed[index] ? row.password : '••••••••') : '—'}</code><button type="button" aria-label={(showPasswords !== !!revealed[index] ? 'Hide' : 'Show') + ' password for ' + row.username} aria-pressed={showPasswords !== !!revealed[index]} onClick={() => setRevealed(previous => ({ ...previous, [index]: !previous[index] }))}>{showPasswords !== !!revealed[index] ? <EyeOff size={15}/> : <Eye size={15}/>}</button></div></td>
            <td>{row.errors.length ? <div className="bulk-validation has-errors"><CircleAlert size={15}/><ul>{row.errors.map((message, item) => <li key={item}>{message}</li>)}</ul></div> : <span className="bulk-validation is-ready"><CheckCircle2 size={15}/>Ready to import</span>}</td>
          </tr>)}
        </tbody></table></div>
        {!visible.length && <div className="bulk-empty"><Users size={28}/><strong>{rows.length ? 'No users match these filters' : 'No account rows found'}</strong><p>{rows.length ? 'Try another search or clear the filters.' : 'Add your users below the column headings in the Excel template.'}</p>{rows.length > 0 && <button className="cfg-btn-cancel" onClick={() => { setSearch(''); setRole(''); setStatus(''); }}>Clear filters</button>}</div>}
        <div className="bulk-table-note"><LockKeyhole size={14}/>Passwords are hidden by default. Show them only when you need to review the uploaded values.</div>
      </section>
      <div className="bulk-create-bar"><div><span className="bulk-confirm-icon"><ShieldCheck size={22}/></span><div><strong>{selected.length} users selected for creation</strong><p>{canCreate ? 'Your password is required in the next step to confirm this import.' : "You don't have permission to create users in bulk."}</p></div></div><button className="cfg-btn-save" disabled={busy || !canCreate || !selected.length} onClick={() => { setError(''); setConfirming(true); }}>Review & create {selected.length} users<ArrowRight size={16}/></button></div>
    </>}

    <dialog ref={dialog} className="bulk-confirm-dialog" aria-labelledby="bulk-confirm-title" onCancel={event => { if (busy) event.preventDefault(); else closeConfirmation(); }} onClose={() => { setConfirming(false); setPassword(''); }}>
      <form onSubmit={create}>
        <div className="bulk-dialog-heading"><span className="bulk-confirm-icon"><LockKeyhole size={25}/></span><button type="button" className="bulk-icon-button" aria-label="Close import confirmation" disabled={busy} onClick={closeConfirmation}><X size={20}/></button></div>
        <span className="rbac-eyebrow">CONFIRM USER IMPORT</span><h2 id="bulk-confirm-title">Ready to create your users?</h2><p>Enter your account password to create <strong>{selected.length} selected users</strong> with the roles and groups you reviewed.</p>
        <div className="bulk-confirm-summary"><span><Users size={16}/>{selected.length} user accounts</span><span><ShieldCheck size={16}/>Roles checked before creation</span></div>
        <label htmlFor="bulk-admin-password">Your account password</label><div className="bulk-admin-password"><input ref={passwordInput} id="bulk-admin-password" required autoComplete="current-password" type={showAdminPassword ? 'text' : 'password'} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} aria-describedby={error ? 'bulk-confirm-error' : undefined}/><button className="bulk-icon-button" type="button" aria-label={showAdminPassword ? 'Hide account password' : 'Show account password'} aria-pressed={showAdminPassword} disabled={busy} onClick={() => setShowAdminPassword(!showAdminPassword)}>{showAdminPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
        {error && <p className="bulk-confirm-error" id="bulk-confirm-error" role="alert"><CircleAlert size={16}/>{error}</p>}
        {busy && <div className="bulk-importing" role="status"><span className="bulk-spinner"/>Creating user accounts. Please keep this window open.</div>}
        <div className="bulk-dialog-actions"><button type="button" className="cfg-btn-cancel" disabled={busy} onClick={closeConfirmation}>Back to review</button><button className="cfg-btn-save" type="submit" disabled={busy || !password || !canCreate || !selected.length}>{busy ? 'Creating users…' : `Create ${selected.length} users`}{!busy && <ArrowRight size={16}/>}</button></div>
      </form>
    </dialog>
  </div>;
}
