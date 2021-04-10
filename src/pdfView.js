import { h, render, createRef, Fragment, Component } from 'preact';
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import * as Layout from "./layout.js"
import AnnotationLayer from "./annotation.js"
import Chat from "./chat.js"
import { eventVersion }  from "./constants.js"
import * as Icons from "./icons.js"

export default class PdfView extends Component {

    static PDFStore = {} 
    //we store downloaded PDFs here in order to avoid excessive downloads. 
    //Could alternatively use localstorage or some such eventually. We don't
    //use preact state since changes here aren't relevent to UI.

    annotationLayer = createRef()

    constructor(props) {
        super(props)
        this.state = { 
            roomId : null,
            focus: null,
            totalPages: null,
            panelVisible: false,
            hasSelection: false,
        }
        this.checkForSelection = this.checkForSelection.bind(this)
        //need the `bind` here in order to pass a named function into the event
        //listener with the proper `this` reference
    }

    componentDidMount() { document.addEventListener("selectionchange", this.checkForSelection) }

    componentWillUnmount() { document.removeEventListener("selectionchange", this.checkForSelection) }

    documentView = createRef()

    setId = id => {
        //sets the roomId, and also tries to use that information to update the focus.
        this.setState({roomId : id}, _ => this.props.queryParams.get("focus") 
                                       ? this.focusByUUID(this.props.queryParams.get("focus")) 
                                       : null)
    }

    focusByUUID = uuid => {
        const theRoom = this.props.client.getRoom(this.state.roomId)
        const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
        const theAnnotation = theRoomState.getStateEvents(eventVersion,uuid)
        if (theAnnotation) this.setState({focus : theAnnotation.getContent()})
    }

    setTotalPages = num => this.setState({totalPages : num})

    togglePanel = () => this.setState({panelVisible : !this.state.panelVisible})

    checkForSelection () {
        if (this.selectionTimeout) clearTimeout(this.selectionTimeout)
        let theSelection = window.getSelection()
        let hasSelection = !window.getSelection().isCollapsed 
                         && this.documentView.current.contains(window.getSelection().getRangeAt(0).endContainer) 
                         && this.documentView.current.contains(window.getSelection().getRangeAt(0).startContainer)
        this.selectionTimeout = setTimeout(200,this.setState({hasSelection : hasSelection}))
        //timeout to avoid excessive rerendering
    }

    openAnnotation = _ => {
        var theSelection = window.getSelection()
        if (theSelection.isCollapsed) return
        var theRange = theSelection.getRangeAt(0)
        var clientRects = Array.from(theRange.getClientRects())
                               .map(rect => Layout.rectRelativeTo(this.annotationLayer.current.base, rect))
        var uuid = Math.random().toString(36).substring(2)
        //room creation is a bit slow, might want to rework this slightly for responsiveness
        this.props.client.createRoom({ 
            room_alias_name : "room" + uuid,
            name : "room" + uuid,
            visibility : "public",
            topic : "bloviating",
            initial_state : [{
                type : "m.room.join_rules",
                state_key : "",
                content : {"join_rule": "public"}
            }]
        }).then(roominfo => {
            this.props.client.sendStateEvent(this.state.roomId, eventVersion, {
                room_id : roominfo.room_id,
                uuid : uuid, 
                clientRects : JSON.stringify(clientRects),
                activityStatus: "open",
                pageNumber : this.props.pageFocused
            }, uuid).catch(e => alert(e))
            theSelection.removeAllRanges()
        })
    }

    closeAnnotation = _ => {
        this.props.client.sendStateEvent(this.state.roomId, eventVersion, {
            "uuid": this.state.focus.uuid, 
            "clientRects": this.state.focus.clientRects,
            "activityStatus": "closed"
        }, this.state.focus.uuid)
        this.setState({focus : null})
    }

    setFocus = content => {
        this.props.queryParams.set("focus", content.uuid)
        window.history.replaceState({
            pdfFocused : this.props.pdfFocused,
            pageFocused : this.props.pageFocused,
            annotationFocused : content.uuid,
        },"", "?" + this.props.queryParams.toString()) 
        this.setState({focus : content})
    }

    render(props,state) {
        return (
            <div  id="content-container">
                <div ref={this.documentView} id="document-view">
                    <PdfCanvas annotationLayer={this.annotationLayer}
                               pdfFocused={props.pdfFocused}
                               pageFocused={props.pageFocused}
                               initFocus={this.initFocus}
                               setId={this.setId}
                               setTotalPages={this.setTotalPages}
                               client={props.client}/>
                    <AnnotationLayer ref={this.annotationLayer} 
                                     page={props.pageFocused} 
                                     roomId={state.roomId} 
                                     setFocus={this.setFocus}
                                     focus={state.focus}
                                     client={props.client}/>
                </div>
                <div style={state.panelVisible ? {visibility:"visible"} : {}} id="sidepanel">
                    <Chat client={props.client} focus={state.focus}/>
                </div>
                <nav id="page-nav">
                    <button disabled={props.pageFocused < 2} onclick={_ => props.loadPage(props.pageFocused - 1)}>Prev</button>
                    <button disabled={state.totalPages <= props.pageFocused} onclick={_ => props.loadPage(props.pageFocused + 1)}>Next</button>
                    <button disabled={!state.hasSelection} onclick={this.openAnnotation}>Add Annotation</button>
                    <button disabled={state.hasSelection || !state.focus} onclick={this.closeAnnotation}>Remove Annotation</button>
                </nav>
                <button id="panelToggle" onclick={this.togglePanel}>
                    {state.panelVisible ? Icons.close : Icons.menu }
                </button>
            </div>
        )
    }
}

class PdfCanvas extends Component {

    constructor(props) {
        super(props)
        this.pendingRender = null
        this.hasRendered = false //we allow one initial render, but then require a page change for a redraw
        let syncListener = (state,prevState,data) =>
                state == "PREPARED" 
                ? this.fetchPdf(props.pdfFocused)
                : props.client.off("sync", syncListener)
        if (props.client.isInitialSyncComplete()) this.fetchPdf(props.pdfFocused) 
        else props.client.on("sync", syncListener)
    }

    textLayer = createRef()

    canvas = createRef()

    async fetchPdf (title) {
        var theId = await this.props.client.getRoomIdForAlias("#" + title + ":localhost")
        await this.props.client.joinRoom(theId.room_id)
        this.props.setId(theId.room_id)
        const theRoom = this.props.client.getRoom(theId.room_id)
        const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
        const pdfIdentifier = theRoomState.getStateEvents("org.populus.pdf","").getContent().identifier
        const pdfPath = 'http://localhost:8008/_matrix/media/r0/download/localhost/' + pdfIdentifier
        this.setState({pdfIdentifier : pdfIdentifier})
        if (!PdfView.PDFStore[pdfIdentifier]) {
            console.log('fetched ' + title )
            PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument(pdfPath).promise
            PdfView.PDFStore[pdfIdentifier].then(pdf => this.props.setTotalPages(pdf.numPages))
        }
    }

    async drawPdf () {
        //since we've started rendering, we want to block subsequent render attempts
        this.hasRendered = true 
        const theCanvas = this.canvas.current
        try {this.pendingRender._internalRenderTask.cancel()} catch {}
        const pdf = await PdfView.PDFStore[this.state.pdfIdentifier]

        // Fetch the first page
        const page = await pdf.getPage(this.props.pageFocused || 1)
        console.log('Page loaded');
              
        const devicePixelRatio = window.devicePixelRatio
        const scales = { 1: 3, 2: 6 }
        const scale = scales[devicePixelRatio] || 3
        const viewport = page.getViewport({scale: scale});

        // Prepare canvas using PDF page dimensions

        theCanvas.style.height = `${(viewport.height* 1.5) / scale}px`;
        theCanvas.style.width = `${(viewport.width * 1.5) / scale}px`;
        theCanvas.height = viewport.height;
        theCanvas.width = viewport.width;

        // Render PDF page into canvas context
        const canvasContext = theCanvas.getContext('2d')
        
        const renderContext = {
            canvasContext: canvasContext,
            viewport: viewport,
        };

        this.pendingRender = page.render(renderContext);
        await this.pendingRender.promise
        console.log('Page rendered');
        const text = await page.getTextContent();
        //resize the text and annotation layers to sit on top of the rendered PDF page

        Layout.positionAt(theCanvas.getBoundingClientRect(), this.textLayer.current);
        Layout.positionAt(theCanvas.getBoundingClientRect(), this.props.annotationLayer.current.base);

        //insert the pdf text into the text layer
        PDFJS.renderTextLayer({
            textContent: text,
            container: document.getElementById("text-layer"),
            viewport: page.getViewport({scale: 1.5}),
            textDivs: [],
        });
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (!this.hasRendered || (prevProps.pageFocused != this.props.pageFocused)) {
            this.textLayer.current.innerHTML = ""
            this.drawPdf()
        }
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
            <Fragment>
                <canvas ref={this.canvas} data-page={props.pageFocused} id="pdf-canvas"/>
                <div style="z-index:3" ref={this.textLayer} id="text-layer"/>
            </Fragment>
        )
    }
}
