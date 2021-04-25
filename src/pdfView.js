import { h, render, createRef, Fragment, Component } from 'preact';
import * as PDFJS from "pdfjs-dist/webpack"
import * as Matrix from "matrix-js-sdk"
import * as Layout from "./layout.js"
import AnnotationLayer from "./annotation.js"
import Chat from "./chat.js"
import Navbar from "./navbar.js"
import { eventVersion, serverRoot, domainName, spaceChild, spaceParent }  from "./constants.js"
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
        this.keyboardZoom = this.keyboardZoom.bind(this)
        //need the `bind` here in order to pass a named function into the event
        //listener with the proper `this` reference
    }

    componentDidMount() {
        document.addEventListener("selectionchange", this.checkForSelection)
        document.addEventListener('keypress', this.keyboardZoom)
    }

    componentWillUnmount() { 
        document.removeEventListener("selectionchange", this.checkForSelection) 
        document.removeEventListener('keypress', this.keyboardZoom)
    }

    handlePointerDown = e => { 
        this.pointerCache.push(e)
        if (this.pointerCache.length == 2) {
            this.initialDistance = Math.abs(this.pointerCache[0].clientX - this.pointerCache[1].clientX)
            this.initialZoom = this.state.zoomFactor
            this.setState({pinching : true})
        }
    }

    handlePointerUp = e => { 
        this.pointerCache = this.pointerCache.filter(pointerEv => pointerEv.pointerId != e.pointerId)
        if (this.pointerCache.length != 2) this.setState({pinching : false})
    }

    handlePointerMove = e => { 
        //update cache
        this.pointerCache.forEach((pointerEvent,index) => {
            if (e.pointerId == pointerEvent.pointerId) this.pointerCache[index] = e
        })
        //if two fingers are down, see if we're pinching
        if (this.pointerCache.length == 2) {
            const touchDistance = Math.abs(this.pointerCache[0].clientX - this.pointerCache[1].clientX)
            this.setZoom(this.initialZoom * (touchDistance/this.initialDistance))
        }
    }

    documentView = createRef()

    pointerCache = []

    setId = id => {
        //sets the roomId, and also tries to use that information to update the focus.
        this.setState({roomId : id}, _ => this.props.queryParams.get("focus")
                                       ? this.focusByRoomId(this.props.queryParams.get("focus"))
                                       : null)
    }

    setPdfWidthPx = px => this.setState({pdfWidthPx: px})

    setPdfFitRatio = ratio => this.setState({pdfFitRatio: ratio})

    setPdfHeightPx = px => this.setState({pdfHeightPx: px})

    setTotalPages = num => this.setState({totalPages : num})

    setZoom = zoomFactor => {
        if (zoomFactor < 1) this.setState({zoomFactor : 1})
        else if (zoomFactor > 5) this.setState({zoomFactor : 5})
        else this.setState({zoomFactor : zoomFactor})
    }

    focusByRoomId = roomId => {
        const theRoom = this.props.client.getRoom(this.state.roomId) //the roomId here is for the PDF
        const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
        const theAnnotation = theRoomState.getStateEvents(spaceChild, roomId)
        if (theAnnotation) {
            this.setState({
                focus : theAnnotation.getContent()[eventVersion],
                panelVisible : true,
            })
        }
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

    keyboardZoom = e => { 
        if (e.key == '+') this.setZoom(this.state.zoomFactor + 0.1)
        if (e.key == '-') this.setZoom(this.state.zoomFactor - 0.1)
    }

    openAnnotation = _ => {
        const theSelection = window.getSelection()
        if (theSelection.isCollapsed) return
        const theRange = theSelection.getRangeAt(0)
        const theSelectedText = theSelection.toString()
        const clientRects = Array.from(theRange.getClientRects())
                                  .map(rect => Layout.rectRelativeTo(this.annotationLayerWrapper.current, rect, this.state.pdfFitRatio * this.state.zoomFactor))
        //TODO: room creation is a bit slow, might want to rework this slightly for responsiveness
        //
        //TODO: we should set room_alias_name, name, and topic in the options
        //object, in a useful way based on the selection
        this.props.client.createRoom({
            visibility : "public",
            initial_state : [{
                type : "m.room.join_rules",
                state_key : "",
                content : {"join_rule": "public"}
            }]
        }).then(roominfo => {
            //set child event in pdfRoom State
            theSelection.removeAllRanges()
            const childContent = {
                via : [domainName],
                [eventVersion] : {
                    pageNumber : this.props.pageFocused,
                    activityStatus: "open",
                    clientRects : JSON.stringify(clientRects),
                    roomId : roominfo.room_id,
                    creator : this.props.client.getUserId(),
                    selectedText : theSelectedText,
                }
            }
            this.props.client.sendStateEvent(this.state.roomId, spaceChild, childContent, roominfo.room_id)
                             .catch(e => alert(e))
            //set parent event in child room state
            this.props.client.sendStateEvent(roominfo.room_id, spaceParent, { via : [domainName] }, this.state.roomId)
                             .catch(e => alert(e))
            this.setFocus(theContent[eventVersion])
            this.setState({ panelVisible : true })
        })
    }

    closeAnnotation = _ => {
        if (confirm('Are you sure you want to close this annotation?')) {
            const theContent = {
                via : [domainName],
                [eventVersion] : {
                    pageNumber : this.state.focus.pageNumber,
                    activityStatus: "closed",
                    clientRects : this.state.focus.clientRects,
                    creator : this.state.focus.creator,
                }
            }
            this.props.client.sendStateEvent(this.state.roomId, spaceChild, theContent, this.state.focus.roomId)
            this.setState({focus : null})
        } else {
            return false;
        }
    }

    setFocus = (content) => {
        this.props.queryParams.set("focus", content.roomId)
        window.history.replaceState({
            pdfFocused : this.props.pdfFocused,
            pageFocused : this.props.pageFocused,
            annotationFocused : content.roomId,
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
            "touch-action" : this.state.pinching ? "none" : null
        }
        const hideUntilWidthAvailable = {
            visibility : state.pdfHeightPx ? null : "hidden",
        }
        return (
            <div style={dynamicDocumentStyle} id="content-container"
                 onPointerDown={this.handlePointerDown}
                 onPointerUp={this.handlePointerUp}
                 onPointerCancel={this.handlePointerUp}
                 onPointerLeave={this.handlePointerUp}
                 onPointerMove={this.handlePointerMove}>
                {state.pdfHeightPx ? null : <div id="document-view-loading">loading...</div>}
                <div style={hideUntilWidthAvailable} ref={this.documentView} id="document-view">
                    <div id="document-wrapper">
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
                    roomId={state.roomId}
                    client={props.client}
                    pdfWidthPx={state.pdfWidthPx}
                    pushHistory={props.pushHistory}/>
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
        this.canvasRefreshAt = Date.now()
        this.pendingRender = null
        this.pendingTextRender = null
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
            PdfView.PDFStore[pdfIdentifier] = PDFJS.getDocument(pdfPath).promise
        } else { console.log('found ' + title + ' in store' ) }
        PdfView.PDFStore[pdfIdentifier]
            .then(pdf => this.props.setTotalPages(pdf.numPages))
            .then(this.resolveFetch)
    }

    //because rendering is async, we need a way to cancel pending render tasks and
    //to make sure that pending drawPdf calls don't proceed. That's what this function does.
    grabControl() {
        const controlToken = {}
        this.controlToken = controlToken
        //we spawn a new control token - this is just an empty object, the
        //important thing is that it's a *new* empty object, since previous
        //drawPdf calls will check to see if the control token is the same as
        //the one that they were spawned with
        try { this.pendingRender.cancel() } catch (err) { console.log(err) }
        try { this.pendingTextRender.cancel() } catch (err) { console.log(err) }
        //now that we're sure we won't spawn any unintended renders, we cancel
        //any pending renders
        this.textLayer.current.innerHTML = ''
        //and we clear the textlayer.
        return controlToken
    }

    async drawPdf (control) {
        //since we've started rendering, we want to block subsequent render attempts
        this.hasRendered = true
        const theCanvas = this.canvas.current
        await this.hasFetched
        const pdf = await PdfView.PDFStore[this.state.pdfIdentifier]

        //exit early if someone else has grabbed control
        if (control != this.controlToken) return
        // Fetch the first page
        const page = await pdf.getPage(this.props.pageFocused || 1)
        console.log('Page loaded');

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

        if (control != this.controlToken) return
        this.pendingRender = page.render(renderContext);

        await this.pendingRender.promise
        console.log('Page rendered');
        const text = await page.getTextContent();

        if (control != this.controlToken) return
        //insert the pdf text into the text layer
        this.pendingTextRender = PDFJS.renderTextLayer({
            textContent: text,
            container: this.textLayer.current,
            viewport: page.getViewport({scale: 1.5}),
            textDivs: [],
        })
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (!this.hasRendered || (prevProps.pageFocused != this.props.pageFocused)) {
            const control = this.grabControl()
            this.drawPdf(control).then(_ =>
                //need to do this to take into account positioning changes caused by rescaling
                this.props.annotationLayer.current.forceUpdate()
            )
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        if (!this.hasRendered || (this.props.pageFocused != nextProps.pageFocused)) {
            this.canvasRefreshAt = Date.now()
        }
    }

    componentDidMount() {
        this.fetchPdf(this.props.pdfFocused) //XXX this will fail if the initial sync isn't complete, but that should be handled by the splash page
        this.textLayer.current.addEventListener('click', event => {
            event.preventDefault() //this should prevent touch-to-search on mobile chrome
            const mouseEvent = new MouseEvent(event.type, event)
            document.elementsFromPoint(event.clientX, event.clientY).forEach(elt => {
                if (elt.hasAttribute("data-annotation")) elt.dispatchEvent(mouseEvent)
            })
        })
    }

    render(props,state) {
        return (
            <Fragment>
                <canvas key={this.canvasRefreshAt} ref={this.canvas} data-page={props.pageFocused} id="pdf-canvas"/>
                <div style="z-index:3" ref={this.textLayer} id="text-layer"/>
            </Fragment>
        )
    }
}
