import { h, render, createRef, Fragment, Component } from 'preact';
import './styles/annotationListing.css'
import * as Matrix from "matrix-js-sdk"
import { eventVersion, serverRoot, domainName, spaceChild, spaceParent }  from "./constants.js"
import MemberPill from './memberPill.js'
import UserColor from './userColors.js'

export default class AnnotationListing extends Component {

    constructor(props) {
        super(props)
        this.stateListener = this.stateListener.bind(this)
        this.state = {
            annotationEntries : []
        }
    }

    componentDidMount () { 
        this.stateListener()
        this.props.client.on("RoomState.events", this.stateListener) 
    }

    componentDidUnmount () { this.props.client.off("RoomState.events", this.stateListener) }

    stateListener = _ => {
        if (this.props.room) {
            const annotations = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
            const annotationEntries = annotations.map(ev => ev.getContent())
                                                 .filter(content => content[eventVersion] && content[eventVersion].activityStatus == "open")
                                                 .map(content => <AnnotationListingEntry 
                                                                    key={content.[eventVersion].roomId}
                                                                    annotationContent={content.[eventVersion]} 
                                                                    focusByRoomId={this.props.focusByRoomId} 
                                                                    pushHistory={this.props.pushHistory}
                                                                    parentRoom={this.props.room}
                                                                    />)
            this.setState({ annotationEntries : annotationEntries })
        } else setTimeout(this.stateListener,500) //keep polling until the room is available
    }

    render (props, state) {
        return <div id="annotation-panel" class={props.class} >
                    {state.annotationEntries.length > 0 
                        ? state.annotationEntries
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
        return <div style={this.userColor.styleVariables} onclick={this.handleClick} class="annotation-listing-entry">
                <div class="annotation-listing-text">{props.annotationContent.selectedText}</div>
                <div class="annotation-listing-page">page: {props.annotationContent.pageNumber}</div>
                <div class="annotation-listing-creator">creator: <MemberPill member={this.creator}/></div>
            </div>
    }
}
