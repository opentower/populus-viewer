import { h, render, createRef, Fragment, Component } from 'preact';
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import * as Layout from "./layout.js"
import AnnotationLayer from "./annotation.js"
import Chat from "./chat.js"
import Navbar from "./navbar.js"
import { eventVersion, serverRoot, domainName }  from "./constants.js"
import * as Icons from "./icons.js"

export default class PdfView extends Component {

    static PDFStore = {} 
    //we store downloaded PDFs here in order to avoid excessive downloads. 
    //Could alternatively use localstorage or some such eventually. We don't
    //use preact state since changes here aren't relevent to UI.

    annotationLayer = createRef()

    annotationLayerWrapper = createRef()

    constructor(props) {
        super(props)
        this.state = { 
            roomId : null,
            focus: null,
            totalPages: null,
            panelVisible: false,
            hasSelection: false,
            pdfWidthPx: null,
            pdfHeightPx: null,
            pdfFitRatio: 1,
            zoomFactor: 1,
        }
        this.checkForSelection = this.checkForSelection.bind(this)
        //need the `bind` here in order to pass a named function into the event
        //listener with the proper `this` reference
    }

    componentDidMount() { 
        document.addEventListener("selectionchange", this.checkForSelection) 
        document.addEventListener('keydown', e => { if (e.key == '+') {
            this.setState({zoomFactor : this.state.zoomFactor + 0.1})
        }})
        document.addEventListener('keydown', e => { if (e.key == '-') {
            this.setState({zoomFactor : this.state.zoomFactor - 0.1})
        }})
    }

    componentWillUnmount() { document.removeEventListener("selectionchange", this.checkForSelection) }

    documentView = createRef()

    setId = id => {
        //sets the roomId, and also tries to use that information to update the focus.
        this.setState({roomId : id}, _ => this.props.queryParams.get("focus") 
                                       ? this.focusByUUID(this.props.queryParams.get("focus")) 
                                       : null)
    }

    setPdfWidthPx = px => this.setState({pdfWidthPx: px})

    setPdfFitRatio = ratio => this.setState({pdfFitRatio: ratio})

    setPdfHeightPx = px => this.setState({pdfHeightPx: px})
    
    setTotalPages = num => this.setState({totalPages : num})

    focusByUUID = uuid => {
        const theRoom = this.props.client.getRoom(this.state.roomId)
        const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
        const theAnnotation = theRoomState.getStateEvents(eventVersion,uuid)
        if (theAnnotation) this.setState({focus : theAnnotation.getContent()})
    }


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
                               .map(rect => Layout.rectRelativeTo(this.annotationLayerWrapper.current, rect, this.state.pdfFitRatio * this.state.zoomFactor))
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
            uuid: this.state.focus.uuid, 
            room_id : this.state.focus.room_id,
            pageNumber : this.state.focus.pageNumber,
            clientRects: this.state.focus.clientRects,
            activityStatus : "closed"
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
        const dynamicDocumentStyle = { 
            "--pdfZoomFactor" : state.zoomFactor,
            "--pdfFitRatio" : state.pdfFitRatio,
            "--pdfWidthPx" : state.pdfWidthPx + "px",
            "--pdfHeightPx" : state.pdfHeightPx + "px",
            "--sidePanelVisible" : state.panelVisible ? 1 : 0,
        }
        const hideUntilWidthAvailable = {
            visibility : state.pdfHeightPx ? null : "hidden",
        }
        return (
            <div style={dynamicDocumentStyle} id="content-container">
                {state.pdfHeightPx ? null : <div id="document-view-loading">loading...</div>}
                <div style={hideUntilWidthAvailable} ref={this.documentView} id="document-view">
                    <div  id="document-wrapper">
                        <PdfCanvas setPdfWidthPx={this.setPdfWidthPx}
                                   setPdfHeightPx={this.setPdfHeightPx}
                                   setPdfFitRatio={this.setPdfFitRatio}
                                   annotationLayer={this.annotationLayer}
                                   pdfFocused={props.pdfFocused}
                                   pageFocused={props.pageFocused}
                                   initFocus={this.initFocus}
                                   setId={this.setId}
                                   setTotalPages={this.setTotalPages}
                                   client={props.client}/>
                        <AnnotationLayer ref={this.annotationLayer} 
                                         annotationLayer={this.annotationLayer}
                                         annotationLayerWrapper={this.annotationLayerWrapper}
                                         zoomFactor={state.zoomFactor}
                                         page={props.pageFocused} 
                                         roomId={state.roomId} 
                                         setFocus={this.setFocus}
                                         focus={state.focus}
                                         client={props.client}/>
                    </div>
                </div>
                <div style={state.panelVisible ? {visibility:"visible"} : {}} id="sidepanel">
                    <Chat client={props.client} focus={state.focus}/>
                </div>
                <Navbar selected={state.hasSelection}
                    addann={this.openAnnotation}
                    closeann={this.closeAnnotation}
                    page={props.pageFocused}
                    total={state.totalPages}
                    focus={state.focus}
                    pdfWidthPx={state.pdfWidthPx}
                    loadPage={props.loadPage}/>
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
        this.hasFetched = new Promise((resolve,reject) => { 
            this.resolveFetch = resolve 
            this.rejectFetch = reject
        })
    }

    textLayer = createRef()

    canvas = createRef()

    async fetchPdf (title) {
        var theId = await this.props.client.getRoomIdForAlias("#" + title + ":" + domainName)
        await this.props.client.joinRoom(theId.room_id)
        this.props.setId(theId.room_id)
        const theRoom = this.props.client.getRoom(theId.room_id)
        const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
        const pdfIdentifier = theRoomState.getStateEvents("org.populus.pdf","").getContent().identifier
        const pdfPath = serverRoot + '/_matrix/media/r0/download/' + domainName + '/' + pdfIdentifier
        this.setState({pdfIdentifier : pdfIdentifier})
        if (!PdfView.PDFStore[pdfIdentifier]) {
            console.log('fetching ' + title )
            this.resolveFetch()
            PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument(pdfPath).promise
            PdfView.PDFStore[pdfIdentifier].then(pdf => this.props.setTotalPages(pdf.numPages))
        } else {
            console.log('found ' + title + ' in store' )
            this.resolveFetch()
        }
    }

    async drawPdf () {
        //since we've started rendering, we want to block subsequent render attempts
        this.hasRendered = true 
        const theCanvas = this.canvas.current
        try {this.pendingRender._internalRenderTask.cancel()} catch {}
        await this.hasFetched
        const pdf = await PdfView.PDFStore[this.state.pdfIdentifier]

        // Fetch the first page
        const page = await pdf.getPage(this.props.pageFocused || 1)
        console.log('Page loaded');
              
        const devicePixelRatio = window.devicePixelRatio
        const scale = 3
        const viewport = page.getViewport({scale: scale});

        // Prepare canvas using PDF page dimensions

        theCanvas.height = viewport.height;
        theCanvas.width = viewport.width;

        // pass scaled height in px upwards for css variables

        const pdfWidthPx = Math.min((viewport.width* 1.5) / scale, window.innerWidth)
        const pdfHeightPx = (pdfWidthPx / viewport.width) * viewport.height
        this.props.setPdfWidthPx(pdfWidthPx)
        this.props.setPdfFitRatio(Math.min(1,window.innerWidth / ((viewport.width* 1.5) / scale)))
        this.props.setPdfHeightPx(pdfHeightPx)

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
            this.drawPdf().then(_ => 
                //need to do this to take into account positioning changes caused by rescaling
                this.props.annotationLayer.current.forceUpdate()
            )
        }
    }

    componentDidMount() {
        this.fetchPdf(this.props.pdfFocused) //XXX this will fail if the initial sync isn't complete, but that should be handled by the splash page
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
