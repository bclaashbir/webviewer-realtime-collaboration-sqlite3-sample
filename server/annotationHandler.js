const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const TABLE = 'annotations';
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8181});

module.exports = (app) => {
  
  // Create and initialize database
  if (!fs.existsSync('server/xfdf.db')) { 
    fs.writeFileSync('server/xfdf.db', '');
  }
  const db = new sqlite3.Database('./xfdf.db');
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS ${TABLE} (documentId TEXT, annotationId TEXT PRIMARY KEY, xfdfString TEXT, widget TEXT)`);
  });

  // Connect to WebSocket client
  wss.on('connection', ws => {   
    // When message is received from client
    //ws.on('message', message => {
    ws.on('message', function message(data, isBinary) {
      //const documentId = JSON.parse(message).documentId;
      //const annotationId = JSON.parse(message).annotationId;
      //const xfdfString = JSON.parse(message).xfdfString.replace(/\'/g, `''`);
      const documentId = JSON.parse(data).documentId;
      const annotationId = JSON.parse(data).annotationId;
      const widget = JSON.parse(data).widget;
      console.log(data);
      //const xfdfString = JSON.parse(data).xfdfString.replace(/\'/g, `''`);
      const xfdfString = JSON.parse(data).xfdfString;
      // Prepare statement to sanitize input
      let statement = db.prepare(`INSERT OR REPLACE INTO annotations VALUES (?, ?, ?, ?)`);
      db.serialize(() => {
        statement.run(documentId, annotationId, xfdfString, widget);
      });
      wss.clients.forEach((client) => {
        // Broadcast to every client except for the client where the message came from
        if (client.readyState === WebSocket.OPEN && ws !== client) {
          //const message = isBinary ? data : data.toString();
          client.send(data, {binary: isBinary});
        } 
      });
    })
  });

  app.get('/server/annotationHandler.js', (req,res) => {
    const documentId = req.query.documentId;
    db.all(`SELECT annotationId, xfdfString FROM ${TABLE} WHERE documentId = '${documentId}'`, (err, rows) => {
      if(err) {
        res.status(204);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(rows);
      }
      res.end();
    });
  });
}
