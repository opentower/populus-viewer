import { h, render, Fragment, Component } from 'preact';
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import * as Layout from "./layout.js"

export default class PdfView extends Component {

    static PDFStore = {} 
    //we store downloaded PDFs here in order to avoid excessive downloads. 
    //Could alternatively use localstorage or some such eventually. We don't
    //use preact state since changes here aren't relevent to UI.

    constructor(props) {
        super(props)
        this.client = props.client
        let syncListener = (state,prevState,data) =>
                state == "PREPARED" 
                ? this.fetchPdf(props.pdfFocused)
                : props.client.off("sync", syncListener)
        if (props.client.isInitialSyncComplete()) this.fetchPdf(props.pdfFocused) 
        else props.client.on("sync",syncListener)
    }

    fetchPdf (title) {
        var theId
        this.client
             .getRoomIdForAlias("#" + title + ":localhost")
             .then(id => {
                 theId = id.room_id
                 this.client.joinRoom(theId)
             }).then(_ => {
                 this.setState({roomId : theId})
                 var theRoom = this.client.getRoom(theId)
                 var theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
                 var pdfIdentifier = theRoomState.getStateEvents("org.populus.pdf","").getContent().identifier
                 this.setState({pdfIdentifier : pdfIdentifier})
                 if (!PdfView.PDFStore[pdfIdentifier]) {
                     PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument('http://localhost:8008/_matrix/media/r0/download/localhost/' + pdfIdentifier).promise
                 }
                 return pdfIdentifier
             }).then(this.drawPdf)
    }

    drawPdf (pdfIdentifier) {
        var theCanvas = document.getElementById("pdf-canvas")
        var textLayer = document.getElementById("text-layer")
        var annotationLayer = document.getElementById("annotation-layer")
        PdfView.PDFStore[pdfIdentifier].then(pdf => {
              // Fetch the first page
              pdf.getPage(1).then(function(page) {
                console.log('Page loaded');
              
                var scale = 1.5;
                var viewport = page.getViewport({scale: scale});

                // Prepare canvas using PDF page dimensions
                var context = theCanvas.getContext('2d');
                theCanvas.height = viewport.height;
                theCanvas.width = viewport.width;

                // Render PDF page into canvas context
                var renderContext = {
                  canvasContext: context,
                  viewport: viewport
                };

                var renderTask = page.render(renderContext);
                renderTask.promise.then(function () {
                  console.log('Page rendered');
                  return page.getTextContent();
                }).then(function(text) {
                  //resize the text and annotation layers to sit on top of the rendered PDF page

                  Layout.positionAt(theCanvas.getBoundingClientRect(), textLayer);
                  Layout.positionAt(theCanvas.getBoundingClientRect(), annotationLayer);

                  //insert the pdf text into the text layer
                  PDFJS.renderTextLayer({
                      textContent: text,
                      container: document.getElementById("text-layer"),
                      viewport: viewport,
                      textDivs: []
                  });
                })
              });
        })
    }

    render(props,state) {
        return (
            <Fragment>
                <div id="document-view">
                    <canvas id="pdf-canvas"/>
                    <div id="annotation-layer"/>
                    <div id="text-layer"/>
                </div>
            </Fragment>
        )
    }
}
