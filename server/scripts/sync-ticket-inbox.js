const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../../database/schema.sql'),schema=fs.readFileSync(file,'utf8');
const block='-- BEGIN TICKET INBOX\n'+fs.readFileSync(path.join(__dirname,'../../database/ticket-inbox.sql'),'utf8')+'\n-- END TICKET INBOX';
const updated=schema.includes('-- BEGIN TICKET INBOX')?schema.replace(/-- BEGIN TICKET INBOX[\s\S]*?-- END TICKET INBOX/,()=>block):schema.replace(/\s*COMMIT;\s*$/,()=> '\n'+block+'\nCOMMIT;\n');
if(process.argv.includes('--check')){if(updated!==schema)throw Error('Run node server/scripts/sync-ticket-inbox.js');console.log('Ticket inbox schema synchronized.')}else fs.writeFileSync(file,updated);
