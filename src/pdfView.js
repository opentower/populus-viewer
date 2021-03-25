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
        this.pendingRender = null
        this.state = { pdfIdentifier : null }
        let syncListener = (state,prevState,data) =>
                state == "PREPARED" 
                ? this.fetchPdf(props.pdfFocused)
                : props.client.off("sync", syncListener)
        if (props.client.isInitialSyncComplete()) this.fetchPdf(props.pdfFocused) 
        else props.client.on("sync", syncListener)
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
                 var pdfPath = 'http://localhost:8008/_matrix/media/r0/download/localhost/' + pdfIdentifier
                 this.setState({pdfIdentifier : pdfIdentifier})
                 if (!PdfView.PDFStore[pdfIdentifier]) {
                     console.log('fetched ' + title )
                     PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument(pdfPath).promise
                 }
             })
    }

    drawPdf () {
        var theCanvas = document.getElementById("pdf-canvas")
        var textLayer = document.getElementById("text-layer")
        var annotationLayer = document.getElementById("annotation-layer")
        try {this.pendingRender._internalRenderTask.cancel()} catch {}
        PdfView.PDFStore[this.state.pdfIdentifier].then(pdf => {
              //Lock navigation
              this.navLock = true
              // Fetch the first page
                pdf.getPage(this.props.pageFocused || 1).then(page => {
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

                this.pendingRender = page.render(renderContext);
                this.pendingRender.promise.then(_ => {
                  console.log('Page rendered');
                  return page.getTextContent();
                }).then(text => {
                   
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

    componentDidUpdate(prevProps, prevState, snapshot) {
        this.drawPdf()
    }

    render(props,state) {
        return (
            <Fragment>
                <div id="document-view">
                    <canvas data-page={props.pageFocused.page} id="pdf-canvas"/>
                    <div id="annotation-layer"/>
                    <div id="text-layer"/>
                </div>
                <div>
                    <button onclick={_ => props.loadPage(props.pageFocused + 1)}>Next</button>
                    <button onclick={_ => props.loadPage(props.pageFocused - 1)}>Prev</button>
                </div>
            </Fragment>
        )
    }
}
