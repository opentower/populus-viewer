import { h, render, createRef, Fragment, Component } from 'preact';
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import * as Layout from "./layout.js"
import AnnotationLayer from "./annotation.js"

export default class PdfView extends Component {

    static PDFStore = {} 
    //we store downloaded PDFs here in order to avoid excessive downloads. 
    //Could alternatively use localstorage or some such eventually. We don't
    //use preact state since changes here aren't relevent to UI.

    textLayer = createRef()

    annotationLayer = createRef()

    canvas = createRef()

    constructor(props) {
        super(props)
        this.client = props.client
        this.pendingRender = null
        this.state = { 
            pdfIdentifier : null,
            roomId : null
        }
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
                 const theRoom = this.client.getRoom(theId)
                 const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
                 const pdfIdentifier = theRoomState.getStateEvents("org.populus.pdf","").getContent().identifier
                 const pdfPath = 'http://localhost:8008/_matrix/media/r0/download/localhost/' + pdfIdentifier
                 this.setState({pdfIdentifier : pdfIdentifier})
                 if (!PdfView.PDFStore[pdfIdentifier]) {
                     console.log('fetched ' + title )
                     PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument(pdfPath).promise
                 }
             })
    }

    drawPdf () {
        //could use preact refs for these
        const theCanvas = this.canvas.current
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

                  Layout.positionAt(theCanvas.getBoundingClientRect(), this.textLayer.current);
                  Layout.positionAt(theCanvas.getBoundingClientRect(), this.annotationLayer.current.base);

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
        this.textLayer.current.innerHTML = ""
        this.drawPdf()
    }

    componentDidMount() {
        this.textLayer.current.addEventListener('click', event => {
            const mouseEvent = new MouseEvent(event.type, event)
            document.elementsFromPoint(event.clientX, event.clientY).forEach(elt => {
                if (elt.hasAttribute("data-annotation")) elt.dispatchEvent(mouseEvent)
            })
        })
    }

    render(props,state) {
        return (
            <div id="content-container">
                <div id="document-view">
                    <canvas ref={this.canvas} data-page={props.pageFocused} id="pdf-canvas"/>
                    <AnnotationLayer ref={this.annotationLayer} 
                                     page={props.pageFocused} 
                                     roomId={state.roomId} 
                                     client={props.client}/>
                    <div ref={this.textLayer} id="text-layer"/>
                </div>
                <div>
                    <button onclick={_ => props.loadPage(props.pageFocused + 1)}>Next</button>
                    <button onclick={_ => props.loadPage(props.pageFocused - 1)}>Prev</button>
                </div>
            </div>
        )
    }
}
