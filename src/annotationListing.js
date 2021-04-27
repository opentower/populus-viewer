import { h, render, createRef, Fragment, Component } from 'preact';
import './styles/annotationListing.css'
import * as Matrix from "matrix-js-sdk"
import { eventVersion, serverRoot, domainName, spaceChild, spaceParent }  from "./constants.js"
import MemberPill from './memberPill.js'
import UserColor from './userColors.js'

export default class AnnotationListing extends Component {
    render (props, state) {
        var annotationEntries = []
        if (props.room) {
            const annotations = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
            annotationEntries = annotations.map(ev => ev.getContent())
                                                  .filter(content => content[eventVersion].activityStatus == "open")
                                                  .map(content => <AnnotationListingEntry 
                                                                    key={content.[eventVersion].roomId}
                                                                    annotationContent={content.[eventVersion]} 
                                                                    focusByRoomId={props.focusByRoomId} 
                                                                    pushHistory={props.pushHistory}
                                                                    parentRoom={props.room}
                                                                    />)
        } 
        return <div id="annotation-panel" class="panel-widget-1">{annotationEntries}</div>
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
