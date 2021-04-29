import { h, render, createRef, Fragment, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"
import { eventVersion, spaceChild }  from "./constants.js"
import UserColor from "./userColors.js"
import './styles/annotation-layer.css'
import './styles/content-container.css'
import './styles/text-layer.css'


export default class AnnotationLayer extends Component {
    constructor(props) {
        super(props)
        this.handleStateChange = this.handleStateChange.bind(this)
    }

    componentDidMount() { this.props.client.on("RoomState.events",this.handleStateChange) }

    componentWillUnmount() { this.props.client.off("RoomState.events",this.handleStateChange) }

    handleStateChange = event => {
        if (event.getRoomId() == this.props.roomId && event.getType() == spaceChild) {
            this.forceUpdate()
        }
    }

    filterAnnotations (event) {
        return (
            !! event.getContent()[eventVersion] //filter out old eventVersions
            && event.getContent()[eventVersion].pageNumber == this.props.page 
            && event.getContent()[eventVersion].activityStatus != "closed"
        )
    }

    render(props,state) {
        //just to get started
        const theRoom = props.client.getRoom(props.roomId)
        const roomId = props.focus ? props.focus.roomId: null
        var annotations = []
        if (theRoom) { 
            const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
            annotations = theRoomState.getStateEvents(spaceChild)
                                      .filter(event => this.filterAnnotations(event))
                                      .map(event => <Annotation zoomFactor={props.zoomFactor}
                                                                focused={roomId == event.getContent()[eventVersion].roomId}
                                                                setFocus={props.setFocus} 
                                                                event={event}/>)
        }
        return (
            <div ref={props.annotationLayerWrapper} id="annotation-layer">
                {annotations}
            </div>
        )
    }
}

class Annotation extends Component {

    setFocus = _ => { this.props.setFocus(this.props.event.getContent()[eventVersion]) }

    inlineAnnotations = createRef()

    eventContent = this.props.event.getContent()[eventVersion]

    roomId = this.eventContent.roomId

    boundingRect = JSON.parse(this.eventContent.boundingClientRect)

    spans = JSON.parse(this.eventContent.clientRects)
                .map(rect => (<RectSpan zoomFactor={this.props.zoomFactor} setFocus={this.setFocus} rect={rect}/>))

    userColor = new UserColor(this.eventContent.creator)

    render(props,state) {
        return <div style={this.userColor.styleVariables} data-focused={props.focused} id={this.roomId}>
                    <BarTab rect={this.boundingRect} zoomFactor={props.zoomFactor} setFocus={this.setFocus}/>
                    <InlineAnnotations rect={this.boundingRect}>
                        {this.spans}
                    </InlineAnnotations>
               </div>
    }
}
                        
class InlineAnnotations extends Component {

    ref = createRef()

    componentDidMount() { Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) }

    componentDidUpdate() { Layout.positionRelativeAt(this.props.rect, this.ref.current, this.props.zoomFactor) }

    render(props,state) {
        return <div ref={this.ref} class="inline-annotations">{props.children}</div>
    }
}

class BarTab extends Component {

    constructor(props) {
        super(props)
        this.state = {
            overlapOffset : 0
        }
    }


    ref = createRef()

    getTabRect = _ => new DOMRect(5 + this.state.overlapOffset, this.props.rect.y, 5,this.props.rect.height)

    componentDidMount() { 
        Layout.positionRelativeAt(this.getTabRect(), this.ref.current, this.props.zoomFactor) 
        this.scootch()
    }

    componentDidUpdate() { 
        Layout.positionRelativeAt(this.getTabRect(), this.ref.current, this.props.zoomFactor) 
        this.scootch()
    }

    scootch = _ => { 
        const rect = this.ref.current.getBoundingClientRect()
        const overlaps = document.elementsFromPoint(rect.x + 1, rect.y + 1)
                                 .filter(elt => {
                                    const eltRect = elt.getBoundingClientRect()
                                    const isAnnot = elt.className == "annotation-bartab"
                                    const isPrior = elt.compareDocumentPosition(this.ref.current) == 4
                                    return (isAnnot && ((eltRect.y < rect.y) || (isPrior && eltRect.y == rect.y)))
                                })
        if (overlaps.length > 0) this.setState({overlapOffset : this.state.overlapOffset + 10})
    }

    render(props,state) {
        return <span onclick={props.setFocus} 
                     class="annotation-bartab" 
                     data-annotation ref={this.ref}/>
    }
}

class RectSpan extends Component {

    ref = createRef()

    componentDidMount() { Layout.positionRelativeAt(this.props.rect,this.ref.current, this.props.zoomFactor) }

    componentDidUpdate() { Layout.positionRelativeAt(this.props.rect,this.ref.current, this.props.zoomFactor) }

    render(props,state) {
        return <span onclick={props.setFocus} data-annotation ref={this.ref}/>
    }
}
