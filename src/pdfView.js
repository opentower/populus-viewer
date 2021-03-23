import { h, render, Fragment, Component } from 'preact';
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"

export default class PdfView extends Component {

    constructor(props) {
        super(props)
        this.client = props.client
        let fetchPdf = _ => this.fetchPdf(props.queryParams.get("title"))
        if (props.client.isInitialSyncComplete()) fetchPdf() 
        else {
            props.client.on("sync", function syncListener (state,prevState,data) {
                if (state == "PREPARED") {
                    fetchPdf(props.queryParams.get("title"))
                    props.client.off("sync", syncListener)
                }
            })
        }
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
                 var loadingTask = PDFJS.getDocument('http://localhost:8008/_matrix/media/r0/download/localhost/' + pdfIdentifier)
                 this.setState({pdfPromise : loadingTask.promise})
             }).then(_ => this.drawPdf())
    }

    drawPdf () {
        var theCanvas = document.getElementById("pdfCanvas")
        this.state.pdfPromise.then(pdf => {
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

                  layout.positionAt(theCanvas.getBoundingClientRect(), textLayer);
                  layout.positionAt(theCanvas.getBoundingClientRect(), annotationLayer);

                  //insert the pdf text into the text layer
                  pdfjsLib.renderTextLayer({
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
                <canvas id="pdfCanvas"></canvas>
            </Fragment>
        )
    }
}
