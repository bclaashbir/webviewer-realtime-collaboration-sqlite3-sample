const viewerElement = document.getElementById('viewer');

let annotationManager = null;
const DOCUMENT_ID = 'webviewer-demo-1';
const hostName = window.location.hostname;
const url = `ws://${hostName}:8181`;
const connection = new WebSocket(url);
const nameList = ['Andy', 'Andrew', 'Logan', 'Justin', 'Matt', 'Sardor', 'Zhijie', 'James', 'Kristian', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'David', 'Joseph', 'Thomas', 'Naman', 'Nancy', 'Sandra'];
const serializer = new XMLSerializer();

connection.onerror = error => {
  console.warn(`Error from WebSocket: ${error}`);
}

WebViewer.Iframe({
  path: 'lib', // path to the PDFTron 'lib' folder
  initialDoc: 'extractedDocument (2).pdf',
  l: 'INSERT TRIAL KEY HERE',
  documentXFDFRetriever: async () => {
    const rows = await loadXfdfStrings(DOCUMENT_ID);
    return JSON.parse(rows).map(row => row.xfdfString);
  },
}, viewerElement).then( instance => {

  // Instance is ready here
  const tool = instance.Core.documentViewer.getTool('AnnotationCreateSignature');
  tool.setSigningMode(instance.Core.Tools.SignatureCreateTool.SigningModes.ANNOTATION);
  instance.UI.enableFeatures([instance.UI.Feature.Initials]);
  annotationManager = instance.Core.documentViewer.getAnnotationManager();
  // Assign a random name to client
  annotationManager.setCurrentUser(nameList[Math.floor(Math.random()*nameList.length)]);


  instance.Core.documentViewer.addEventListener('annotationsLoaded', () => {
    const widgets = annotationManager.getAnnotationsList().filter(annotation => annotation instanceof instance.Core.Annotations.WidgetAnnotation);
    widgets.forEach((widget) => {
      widget.addEventListener('mousedown', async () => {
        console.log("widget pressed");
        annotList = [await widget];
        const xfdf = await annotationManager.exportAnnotations({annotationList: annotList, widgets: true, fields: false});
        console.log(xfdf);
        const widgetXfdf = cleanupXML(xfdf, widget.fieldName);
        console.log(widgetXfdf);
        sendWidgetChange(widgetXfdf, widget.Id);

        });
      });
    });


  annotationManager.addEventListener('fieldChanged', async e => {
    console.log("field changed");

    const xfdfString = await annotationManager.exportAnnotationCommand();
    console.log(xfdfString);
    const parser = new DOMParser();
    const commandData = parser.parseFromString(xfdfString, 'text/xml');

    sendFieldChange(xfdfString, e.field, e.value);
  });


  annotationManager.addEventListener('annotationChanged', async (annotations, action, {imported}) => {
    // If annotation change is from import, return
    if (imported) {
      return;
    }

    console.log("annotation changed");

    const xfdfString = await annotationManager.exportAnnotationCommand();
    console.log(xfdfString);
    // Parse xfdfString to separate multiple annotation changes to individual annotation change
    const parser = new DOMParser();
    const commandData = parser.parseFromString(xfdfString, 'text/xml');
    const addedAnnots = commandData.getElementsByTagName('add')[0];
    const modifiedAnnots = commandData.getElementsByTagName('modify')[0];
    const deletedAnnots = commandData.getElementsByTagName('delete')[0];

    // List of added annotations
    addedAnnots.childNodes.forEach((child) => {
      sendAnnotationChange(child, 'add');
    });

    // List of modified annotations
    modifiedAnnots.childNodes.forEach((child) => {
      sendAnnotationChange(child, 'modify');
    });

    // List of deleted annotations
    deletedAnnots.childNodes.forEach((child) => {
      sendAnnotationChange(child, 'delete');
    });
  });

  connection.onmessage = async (message) => {
    console.log("message:");
    console.log(message);
    console.log(message.data);
    //console.log(JSON.parse(message).annotationId);
    const annotation = JSON.parse(message.data);
    console.log(annotation.xfdfString);
    if (annotation.widget)
    {
      console.log("should import annotation");
      const annotations = await annotationManager.importAnnotations(annotation.xfdfString);
      await annotationManager.drawAnnotationsFromList(annotations);
      annotations.forEach((widget) => {
        widget.addEventListener('mousedown', async () => {
          console.log("widget pressed");
          annotList = [await widget];
          const xfdf = await annotationManager.exportAnnotations({annotationList: annotList, widgets: true, fields: false});
          console.log(xfdf);
          const widgetXfdf = cleanupXML(xfdf, widget.fieldName);
          console.log(widgetXfdf);
          sendWidgetChange(widgetXfdf, widget.Id);
          });
        });
    }
    else
    {
    console.log("should import annotation command");
    const annotations = await annotationManager.importAnnotationCommand(annotation.xfdfString);
    console.log(annotations);
    await annotationManager.drawAnnotationsFromList(annotations);
    }
  }
});

const loadXfdfStrings = (documentId) => {
  return new Promise((resolve, reject) => {
    fetch(`/server/annotationHandler.js?documentId=${documentId}`, {
      method: 'GET',
    }).then((res) => {
      if (res.status < 400) {
        res.text().then(xfdfStrings => {
          resolve(xfdfStrings);
        });
      } else {
        reject(res);
      }
    });
  });
};


// wrapper function to convert xfdf fragments to full xfdf strings
const convertToXfdf = (changedAnnotation, action) => {
  let xfdfString = `<?xml version="1.0" encoding="UTF-8" ?><xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve"><fields />`;
  if (action === 'add') {
    xfdfString += `<add>${changedAnnotation}</add><modify /><delete />`;
  } else if (action === 'modify') {
    xfdfString += `<add /><modify>${changedAnnotation}</modify><delete />`;
  } else if (action === 'delete') {
    xfdfString += `<add /><modify /><delete>${changedAnnotation}</delete>`;
  }
  xfdfString += `</xfdf>`;
  return xfdfString;
}

// helper function to send annotation changes to WebSocket server
const sendAnnotationChange = (annotation, action) => {
  if (annotation.nodeType !== annotation.TEXT_NODE) {
    const annotationString = serializer.serializeToString(annotation);
    connection.send(JSON.stringify({
      documentId: DOCUMENT_ID,
      annotationId: annotation.getAttribute('name'),
      xfdfString: convertToXfdf(annotationString, action),
      widget: false
    }));
  }
}

const sendFieldChange = (xfdf, name, value) => {
    connection.send(JSON.stringify({
      documentId: DOCUMENT_ID,
      annotationId: name,
      xfdfString: xfdf,
      widget:false
    }));
}

const sendWidgetChange = (xfdf, name) => {
  connection.send(JSON.stringify({
    documentId: DOCUMENT_ID,
    annotationId: name,
    xfdfString: xfdf,
    widget: true
  }));
}

//tested ai by asking it to write something to parse the xfdf to get the widget and field info we're interested in, did a pretty good job in producing something that worked,
//though i did do some cleanup to streamline things, should revisit this as it can be cleaned up a bit more
function cleanupXML(xmlString, fieldName) {
  // Create a new DOM parser
  const parser = new DOMParser();
  
  // Parse the XML string into a DOM object
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  // Define the XML namespaces
  const nsResolver = (prefix) => {
      const ns = {
          //'': 'http://ns.adobe.com/xfdf/',
          'xfdf': 'http://ns.adobe.com/xfdf/',
          'pdfinfo': 'http://www.pdftron.com/pdfinfo'
      };
      return ns[prefix] || null;
  };
  
  // Find the field node based on the provided field name
  const fieldNode = xmlDoc.evaluate(`//pdfinfo:ffield[@name='${fieldName}']`, xmlDoc, nsResolver, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  
  if (!fieldNode) {
      return `Field '${fieldName}' not found.`;
  }

  // Serialize the field node to an XML string
  const fieldXml = new XMLSerializer().serializeToString(fieldNode);
  
  // Find the widget node associated with the field
  const widgetNode = xmlDoc.evaluate(`//pdfinfo:widget[@field='${fieldName}']`, xmlDoc, nsResolver, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  
  if (!widgetNode) {
      return {
          field: fieldXml,
          widget: null
      };
  }

  const captionsNode = xmlDoc.evaluate(`//pdfinfo:widget[@field='${fieldName}']/pdfinfo:captions`, xmlDoc, nsResolver, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        
  if (captionsNode) {
      // Update the Normal property
      const normalValue = captionsNode.getAttribute('Normal');
      if (normalValue === ' ') {
          captionsNode.setAttribute('Normal', 'O');
      } else if (normalValue === 'O') {
          captionsNode.setAttribute('Normal', 'Ø');
      } else if (normalValue === 'Ø') {
          captionsNode.setAttribute('Normal', ' ');
      }
    }

  const widgetXml = new XMLSerializer().serializeToString(widgetNode);
  
  const simplifiedXML = `<?xml version="1.0" encoding="UTF-8" ?>
  <xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
    <pdf-info xmlns="http://www.pdftron.com/pdfinfo" version="2" import-version="4">
      ${fieldXml}
      ${widgetXml}
    </pdf-info>
    <annots />
  </xfdf>`;
      
  return simplifiedXML;
}