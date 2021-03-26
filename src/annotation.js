import { h, render, createRef, Fragment, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"

const eventVersion = "org.populus.annotation.3" //increment to start over with a fresh event type

export default class AnnotationLayer extends Component {
    constructor(props) {
        super(props)
        this.state = { focus : null }
        props.client.on("RoomState.events", event => {
            if (event.event.room_id == props.roomId && event.event.type == eventVersion) {
                console.log("update state")
                this.forceUpdate()
            }
        }) //TODO: remove listener on unmount
    }

    filterAnnotations (page,event) {
        return (
            event.event.content.pageNumber == page 
            && event.event.content.activityStatus != "closed"
        )
    }

    render(props,state) {
        //just to get started
        const theRoom = props.client.getRoom(props.roomId)
        var annotations = []
        if (theRoom) { 
            const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
            annotations = theRoomState.getStateEvents(eventVersion)
                                      .filter(event => this.filterAnnotations(props.page,event))
                                      .map(event => <Annotation event={event}/>)
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

    render(props,state) {
        const spans = JSON.parse(props.event.event.content.clientRects)
                          .map(rect => (<RectSpan rect={rect}/>))
        return <div id={props.event.event.content.uuid}>{spans}</div>
    }
}

class RectSpan extends Component {

    ref = createRef()

    componentDidMount() { Layout.positionRelativeAt(this.props.rect,this.ref.current) }

    componentDidUpdate() { Layout.positionRelativeAt(this.props.rect,this.ref.current) }

    render(props,state) {
        return <span ref={this.ref}></span>
    }
}
