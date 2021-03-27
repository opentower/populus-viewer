import { h, render, createRef, Fragment, Component } from 'preact';
import * as Layout from "./layout.js"
import * as Matrix from "matrix-js-sdk"

const eventVersion = "org.populus.annotation.3" //increment to start over with a fresh event type

export default class AnnotationLayer extends Component {
    constructor(props) {
        super(props)
        this.state = { focus : null }
        props.client.on("RoomState.events", event => {
            //Important that it be "this.props", so that it tracks the changing props of the component
            if (event.event.room_id == this.props.roomId && event.event.type == eventVersion) {
                this.forceUpdate()
            }
        }) 
        window.addEventListener('keydown', e => { if (e.key == "D") this.closeFocus(); })
        window.addEventListener('keydown', e => { if (e.key == "S") this.addAnnotation(); })
        //TODO: remove listeners on unmount
    }

    filterAnnotations (event) {
        return (
            event.event.content.pageNumber == this.props.page 
            && event.event.content.activityStatus != "closed"
        )
    }

    annotationLayer = createRef()

    setFocus = content => this.setState({focus : content})

    closeFocus = _ => {
        this.props.client.sendStateEvent(this.props.roomId, eventVersion, {
            "uuid": this.state.focus.uuid, 
            "clientRects": this.state.focus.clientRects,
            "activityStatus": "closed"
        }, this.state.focus.uuid)
    }

    addAnnotation = _ => {
        var theSelection = window.getSelection()
        if (theSelection.isCollapsed) return
        var theRange = theSelection.getRangeAt(0)
        var clientRects = Array.from(theRange.getClientRects())
                               .map(rect => Layout.rectRelativeTo(this.annotationLayer.current, rect))
        var uuid = Math.random().toString(36).substring(2)
        //room creation is a bit slow, might want to rework this slightly for responsiveness
        this.props.client.createRoom({ 
            room_alias_name : "room" + uuid,
            name : "room" + uuid,
            visibility : "public",
            topic : "bloviating",
            initial_state : [{
                "type": "m.room.join_rules",
                "state_key":"",
                "content": {"join_rule": "public"}
            }]
        }).then(_ => {
            this.props.client.sendStateEvent(this.props.roomId, eventVersion, {
                uuid : uuid, 
                clientRects : JSON.stringify(clientRects),
                activityStatus: "open",
                pageNumber : this.props.page
            }, uuid)
        })
    }

    render(props,state) {
        //just to get started
        const theRoom = props.client.getRoom(props.roomId)
        const uuid = state.focus ? state.focus.uuid : null
        var annotations = []
        if (theRoom) { 
            const theRoomState = theRoom.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
            annotations = theRoomState.getStateEvents(eventVersion)
                                      .filter(event => this.filterAnnotations(event))
                                      .map(event => <Annotation focused={uuid == event.event.content.uuid}
                                                                setFocus={this.setFocus} 
                                                                event={event}/>)
        }
        return (
            <div ref={this.annotationLayer} id="annotation-layer">
                {annotations}
            </div>
        )
    }
}

class Annotation extends Component {

    constructor(props) {
        super(props)
    }

    setFocus = _ => this.props.setFocus(this.props.event.event.content)

    render(props,state) {
        const uuid = props.event.event.content.uuid
        const spans = JSON.parse(props.event.event.content.clientRects)
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
