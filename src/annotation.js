import { h, render, createRef, Fragment, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"
import { eventVersion, spaceChild }  from "./constants.js"
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
            event.getContent()[eventVersion].pageNumber == this.props.page 
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

    render(props,state) {
        const roomId = props.event.getContent()[eventVersion].roomId
        const spans = JSON.parse(props.event.getContent()[eventVersion].clientRects)
                          .map(rect => (<RectSpan zoomFactor={this.props.zoomFactor} setFocus={this.setFocus} rect={rect}/>))
        return <div data-focused={props.focused} id={roomId}>{spans}</div>
    }
}

class RectSpan extends Component {

    ref = createRef()

    componentDidMount() { Layout.positionRelativeAt(this.props.rect,this.ref.current, this.props.zoomFactor) }

    componentDidUpdate() { Layout.positionRelativeAt(this.props.rect,this.ref.current, this.props.zoomFactor) }

    render(props,state) {
        return <span onclick={props.setFocus} data-annotation ref={this.ref}></span>
    }
}
