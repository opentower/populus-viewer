import { h, render, createRef, Fragment, Component } from 'preact';
import './styles/annotationListing.css'
import * as Matrix from "matrix-js-sdk"
import { eventVersion, serverRoot, domainName, spaceChild, spaceParent }  from "./constants.js"
import MemberPill from './memberPill.js'
import UserColor from './userColors.js'

export default class AnnotationListing extends Component {

    constructor(props) {
        super(props)
        this.state = {
            annotationContents : [],
            typing : {},
        }
        this.handleStateUpdate = this.handleStateUpdate.bind(this)
        this.handleTypingNotification = this.handleTypingNotification.bind(this)
    }

    componentDidMount () { 
        this.handleStateUpdate()
        this.props.client.on("RoomState.events", this.handleStateUpdate) 
        this.props.client.on("RoomMember.typing", this.handleTypingNotification)
    }

    componentDidUnmount () { 
        this.props.client.off("RoomState.events", this.handleStateUpdate) 
        this.props.client.off("RoomMember.typing", this.handleTypingNotification)
    }

    handleTypingNotification = (event, member) => {
        const theRoomState = this.props.client.getRoom(this.props.roomId).getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
        const theChildRelation = theRoomState.getStateEvents(spaceChild, member.roomId)
        //We use nested state here because we want to pass this part of the state to a child
        if (theChildRelation) this.setState(prevState => {
            const myId = this.props.client.getUserId()
            const typingOtherThanMe = event.getContent().user_ids.filter(x => x != myId)
            return {typing : { ...prevState.typing, [member.roomId] : typingOtherThanMe}}
        })
    }

    handleStateUpdate = _ => {
        if (this.props.room) {
            const annotationContents = this.props.room.getLiveTimeline()
                                                      .getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
                                                      .map(ev => ev.getContent())
                                                      .filter(content => content[eventVersion] && content[eventVersion].activityStatus == "open")
            this.setState({ annotationContents : annotationContents})
        } else setTimeout(this.handleStateUpdate,500) //keep polling until the room is available
    }

    render (props, state) {
        const annotationEntries = state.annotationContents.map(content => <AnnotationListingEntry 
                                                                key={content.[eventVersion].roomId}
                                                                typing={state.typing[content.[eventVersion].roomId]}
                                                                annotationContent={content.[eventVersion]} 
                                                                focusByRoomId={props.focusByRoomId} 
                                                                pushHistory={props.pushHistory}
                                                                parentRoom={props.room}
                                                                />)
        return <div id="annotation-panel" class={props.class} >
                    {state.annotationContents.length > 0 
                        ? annotationEntries
                        : <div class="empty-marker"><b>No annotations yet available </b></div>
                    }
              </div>
    }
}

class AnnotationListingEntry extends Component {

    handleClick = () => {
        this.props.focusByRoomId(this.props.annotationContent.roomId)
        this.props.pushHistory({
            pageFocused : this.props.annotationContent.pageNumber,
            pdfFocused : this.props.parentRoom.name,
        })
    }

    creator = this.props.parentRoom.getMember(this.props.annotationContent.creator)

    userColor = new UserColor(this.creator.userId)

    render(props,state) {
        const typing = typeof(props.typing) === "object" && Object.keys(props.typing).length > 0 ? true : null
        return <div style={this.userColor.styleVariables} data-annotation-entry-typing={typing} onclick={this.handleClick} class="annotation-listing-entry">
                <div class="annotation-listing-text">{props.annotationContent.selectedText}</div>
                <div class="annotation-listing-page">page: {props.annotationContent.pageNumber}</div>
                <div class="annotation-listing-creator">creator: <MemberPill member={this.creator}/></div>
            </div>
    }
}
