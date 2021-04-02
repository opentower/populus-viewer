import { h, render, createRef, Fragment, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"
import { eventVersion }  from "./constants.js"
import './styles/annotation-layer.css'
import './styles/content-container.css'
import './styles/document-view.css'
import './styles/text-layer.css'


export default class AnnotationLayer extends Component {
    constructor(props) {
        super(props)
        this.handleStateChange = this.handleStateChange.bind(this)
    }

    componentDidMount() { this.props.client.on("RoomState.events",this.handleStateChange) }

    componentWillUnmount() { this.props.client.off("RoomState.events",this.handleStateChange) }

    handleStateChange = event => {
        if (event.getRoomId() == this.props.roomId && event.getType() == eventVersion) {
            this.forceUpdate()
        }
    }

    filterAnnotations (event) {
        return (
            event.getContent().pageNumber == this.props.page 
            && event.getContent().activityStatus != "closed"
        )
    }

    render(props,state) {
        //just to get started
        const theRoom = props.client.getRoom(props.roomId)
        const uuid = props.focus ? props.focus.uuid : null
        var annotations = []
        if (theRoom) { 
            const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
            annotations = theRoomState.getStateEvents(eventVersion)
                                      .filter(event => this.filterAnnotations(event))
                                      .map(event => <Annotation focused={uuid == event.getContent().uuid}
                                                                setFocus={props.setFocus} 
                                                                event={event}/>)
        }
        return (
            <div id="annotation-layer">
                {annotations}
            </div>
        )
    }
}

class Annotation extends Component {

    constructor(props) {
        super(props)
    }

    setFocus = _ => { this.props.setFocus(this.props.event.getContent()) }

    render(props,state) {
        const uuid = props.event.getContent().uuid
        const spans = JSON.parse(props.event.getContent().clientRects)
                          .map(rect => (<RectSpan setFocus={this.setFocus} rect={rect}/>))
        return <div data-focused={props.focused} id={uuid}>{spans}</div>
    }
}

class RectSpan extends Component {

    ref = createRef()

    componentDidMount() { Layout.positionRelativeAt(this.props.rect,this.ref.current) }

    componentDidUpdate() { Layout.positionRelativeAt(this.props.rect,this.ref.current) }

    render(props,state) {
        return <span onclick={props.setFocus} data-annotation ref={this.ref}></span>
    }
}
