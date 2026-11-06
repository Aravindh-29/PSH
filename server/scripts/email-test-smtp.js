const net=require('node:net'),tls=require('node:tls');
async function smtp(options = {}) {
  const messages = [], authentications = [], sockets = new Set();
  const secureContext = tls.createSecureContext({ key: options.key, cert: options.cert });
  function protocol(socket, greeting = true) {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    let buffer = '', dataMode = false, data = [], envelope = [];
    const write = line => socket.write(line + '\r\n');
    if (greeting) write('220 localhost email audit');
    const onData = chunk => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const i = buffer.indexOf('\r\n'); if (i < 0) return;
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (dataMode) {
          if (line === '.') { messages.push({ raw: data.join('\r\n'), recipients: [...envelope] }); dataMode = false; data = []; write('250 accepted locally'); }
          else data.push(line.startsWith('..') ? line.slice(1) : line);
          continue;
        }
        if (/^EHLO|^HELO/i.test(line)) {
          write('250-localhost'); if (options.starttls && !socket.encrypted) write('250-STARTTLS');
          write('250-AUTH PLAIN XOAUTH2'); write('250 SIZE 1048576');
        } else if (/^STARTTLS/i.test(line)) {
          if (!options.starttls) { write('454 TLS unavailable'); continue; }
          write('220 Begin TLS'); socket.removeListener('data', onData);
          const upgraded = new tls.TLSSocket(socket, { isServer: true, secureContext }); protocol(upgraded, false); return;
        } else if (/^AUTH XOAUTH2 /i.test(line)) {
          const value=Buffer.from(line.slice(13),'base64').toString();
          authentications.push({oauth2:true,encrypted:!!socket.encrypted});write(value.includes('Bearer fake-access')?'235 Authenticated':'535 Invalid token');
        } else if (/^AUTH PLAIN /i.test(line)) {
          const values = Buffer.from(line.slice(11), 'base64').toString().split('\0');
          authentications.push({ user: values[1], password: values[2], encrypted: !!socket.encrypted });
          write(values[2] === 'fake-audit-password' ? '235 Authenticated' : '535 Invalid test credential');
        } else if (/^MAIL FROM:/i.test(line)) { envelope = []; write('250 sender accepted'); }
        else if (/^RCPT TO:/i.test(line)) {
          if (options.rejectRecipient) write('550 Recipient rejected by test server');
          else { envelope.push(line.slice(8)); write('250 recipient accepted'); }
        } else if (/^DATA$/i.test(line)) { dataMode = true; write('354 End with dot'); }
        else if (/^QUIT$/i.test(line)) { write('221 Bye'); socket.end(); }
        else write('250 OK');
      }
    };
    socket.on('data', onData);
  }
  const server = options.implicitTLS ? tls.createServer({ key: options.key, cert: options.cert }, socket => protocol(socket)) : net.createServer(socket => protocol(socket));
  server.on('tlsClientError', () => {});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { port: server.address().port, messages, authentications,
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); },
  };
}

module.exports=smtp;
