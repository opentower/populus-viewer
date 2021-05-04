import { h, createRef, render, Fragment, Component } from 'preact';
import { pdfStateType }  from "./constants.js"
import * as Matrix from "matrix-js-sdk"
import UserColor from './userColors.js'
import PdfUpload from './pdfUpload.js'
import MemberPill from './memberPill.js'
import ProfileInformation from './profileInformation.js'
import * as Icons from './icons.js'
import { eventVersion, serverRoot, spaceChild, lastViewed }  from "./constants.js"
import './styles/welcome.css'

export default class WelcomeView extends Component {

    constructor(props) {
        super(props)
        const userId = props.client.getUserId()
        this.user = props.client.getUser(props.client.getUserId())
        this.userColor = new UserColor(userId)
        this.profileListener = this.profileListener.bind(this)
        this.state = {
            uploadVisible : false,
            profileVisible : false,
            inputFocus : false,
            searchFilter : "",
            avatarUrl : Matrix.getHttpUriForMxc(serverRoot, this.user.avatarUrl, 30, 30, "crop"),
        }
    }

    componentDidMount () { this.user.on("User.avatarUrl", this.profileListener) }

    componentWillUnmount () { this.user.off("User.avatarUrl", this.profileListener) }

    profileListener () {
        this.setState({
            avatarUrl : Matrix.getHttpUriForMxc(serverRoot, this.user.avatarUrl, 30, 30, "crop"),
        })
    }

    toggleUploadVisible = _ => this.setState({
        uploadVisible : !this.state.uploadVisible,
        profileVisible : false,
    })

    toggleProfileVisible = _ => this.setState({
        uploadVisible : false,
        profileVisible : !this.state.profileVisible,
    })

    showMainView = _ => this.setState({
        uploadVisible : false,
        profileVisible : false,
    })

    handleInputFocus = _ => this.setState({
        inputFocus : true, 
        uploadVisible : false,
        profileVisible : false,
    })

    handleInputBlur = _ => this.setState({inputFocus: false})

    handleInput = e => {
        this.setState({searchFilter : e.target.value})
    }

    render(props,state) {
        return (
            <Fragment>
                <header id="welcome-header">
                    <div id="welcome-header-content">
                        <div id="welcome-search">
                            <input value={state.searchFilter} oninput={this.handleInput} onblur={this.handleInputBlur} onfocus={this.handleInputFocus} id="welcome-search-input"/>
                            {Icons.search}
                        </div>
                        { !state.inputFocus && <Fragment>
                            <div id="welcome-upload" onclick={this.toggleUploadVisible}>{Icons.newFile}</div>
                            <div id="welcome-profile" onclick={this.toggleProfileVisible} style={this.userColor.styleVariables} >
                                {state.avatarUrl 
                                    ? <img id="welcome-img" src={state.avatarUrl}/> 
                                    : <div id="welcome-initial">{this.user.displayName.slice(0,1)}</div>
                                }
                            </div>
                        </Fragment>}
                    </div>
                </header>
                <div id="welcome-container">
                    {state.uploadVisible 
                        ? <Fragment>
                            <h2>Upload a new PDF</h2>
                            <PdfUpload showMainView={this.showMainView} client={props.client}/>
                        </Fragment>
                        : state.profileVisible 
                            ? <Fragment>
                                <h2>Update Your Profile</h2>
                                <ProfileInformation logoutHandler={props.logoutHandler} showMainView={this.showMainView} client={props.client}/>
                            </Fragment>
                            : <Fragment>
                                <h2>Conversations</h2>
                                <RoomList queryParams={props.queryParams} searchFilter={state.searchFilter} {...props}/>
                            </Fragment>
                    }
                </div>
            </Fragment>
        )
    }
}

class RoomList extends Component {
    constructor(props) {
        super(props)
        this.state = {
            rooms : props.client.getVisibleRooms()
        }
        //need to do this to bind "this" as refering to the RoomList component in the listener
        this.roomListener = this.roomListener.bind(this)
    }

    roomListener (room) { this.setState({ rooms : this.props.client.getVisibleRooms() }) }

    componentDidMount () { 
        this.props.client.on("Room", this.roomListener) 
        this.props.client.on("Room.name", this.roomListener) 
        this.props.client.on("RoomState.events", this.roomListener)
        this.props.client.on("Room.accountData", this.roomListener)
        //State events might cause excessive rerendering, but we can optimize for that later
    }

    componentWillUnmount () { 
        this.props.client.off("Room", this.roomListener) 
        this.props.client.off("Room.name", this.roomListener) 
        this.props.client.off("RoomState.events", this.roomListener)
        this.props.client.off("Room.accountData", this.roomListener)
    }

    render(props,state) {
        //TODO: We're going to want to have different subcategories of rooms,
        //for actual pdfs, and for annotation discussions
        const rooms = state.rooms.filter(room => room.name.toLowerCase().includes(props.searchFilter.toLowerCase()))
                                 .sort((a,b) => { 
                                        const ts1 = a.getLastActiveTimestamp() 
                                        const ts2 = b.getLastActiveTimestamp()
                                        if (ts1 < ts2) return 1
                                        else if (ts2 < ts1) return -1
                                        else return 0
                                  }).map(room => { return <RoomListing key={room.roomId} 
                                                                       queryParams={props.queryParams} 
                                                                       pushHistory={props.pushHistory} 
                                                                       client={props.client} 
                                                                       room={room}/> })
        return (
            <Fragment>
                <div>{rooms}</div>
            </Fragment>
        )
    }
}

class RoomListing extends Component {
    render (props, state) {
        var pdfEvent = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(pdfStateType,"")
        var annotations = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents(spaceChild)
        if (pdfEvent) return (<PDFRoomEntry queryParams={props.queryParams} 
                                            annotations={annotations} 
                                            pushHistory={props.pushHistory} 
                                            client={props.client} 
                                            room={props.room}
                                            pdfevent={pdfEvent}/>)
    }
}

class PDFRoomEntry extends Component {

    constructor(props) {
        super(props)
        this.state = { 
            buttonsVisible : false,
            detailsOpen : false,
        }
    }

    handleLoad = _ => {
        const lastViewedPage = this.props.room.getAccountData(lastViewed)
                               ? this.props.room.getAccountData(lastViewed).getContent().page 
                               : 1
        this.props.pushHistory({
            pdfFocused : this.props.room.name,
            pageFocused : lastViewedPage || 1,
        })
    }

    toggleButtons = _ => this.setState({ buttonsVisible : !this.state.buttonsVisible })

    toggleFavorite  = _ => {
        if (this.props.room.tags["m.favourite"]) this.props.client.deleteRoomTag(this.props.room.roomId, "m.favourite")
        else this.props.client.setRoomTag(this.props.room.roomId, "m.favourite", {order : 0.5})
    }

    handleClose = _ => this.props.client.leave(this.props.room.roomId)

    handleDetailsToggle = _ => this.setState({ detailsOpen : !this.state.detailsOpen })

    render (props, state) {
        const date = new Date(props.room.getLastActiveTimestamp())
        const members = props.room.getJoinedMembers()
        const memberIds = members.map(member => member.userId)
        const memberPills = members.map(member => <MemberPill member={member}/>)
        const status = memberIds.includes(props.client.getUserId()) 
                     ? "joined"
                     : "invited"
        const annotations = props.annotations.map(ev => ev.getContent())
                                             .filter(content => !!content[eventVersion]) //so that we can bump eventversion
                                             .filter(content => content[eventVersion].activityStatus == "open")
                                             .map(content => <AnnotationRoomEntry 
                                                                key={content.[eventVersion].roomId}
                                                                pushHistory={props.pushHistory}
                                                                annotationContent={content.[eventVersion]} 
                                                                parentRoom={props.room}
                                                                queryParams={props.queryParams}/>)
        return (
            <div  data-room-status={status} class="roomListingEntry" id={props.room.roomId}>
                <div class="room-listing-heading">
                    {props.room.tags["m.favourite"] ? <span class="fav-star"> {Icons.star} </span>: null}
                    <a onclick={this.handleLoad}>{props.room.name}</a>
                </div>
                <div class="roomListingData">
                <span>Members: </span><div>{memberPills}</div>
                <span>Last Active:</span><div>{date.toLocaleString('en-US',{
                    weekday : "short",
                    day : "numeric",
                    month : "short",
                    hour : "numeric",
                    minute : "numeric",
                    second : "numeric",
                })}</div>
                </div>
                {annotations.length > 0 
                    ?  <div><details>
                        <summary open={state.detailsOpen} ontoggle={this.handleDetailsToggle}>{annotations.length} annotations</summary>
                        <table class="annotationRoomTable">
                            <thead> <tr><td>Text</td><td>Page</td><td>Creator</td></tr></thead>
                            <tbody>{annotations}</tbody>
                        </table>
                    </details>
                    </div>
                    : null
                }
                <div data-room-entry-buttons-visible={state.buttonsVisible} class="roomListingEntryButtons">
                    { state.buttonsVisible ? null : <button title="Toggle buttons" onclick={this.toggleButtons}>{Icons.moreVertical}</button> }
                    { state.buttonsVisible ? <button title="Toggle buttons" onclick={this.toggleButtons}>{Icons.close}</button> : null }
                    { state.buttonsVisible ? <button  title="Toggle Favorite" onclick={this.toggleFavorite}>{Icons.star}</button> : null }
                    { state.buttonsVisible ? <button title="Leave conversation" onclick={this.handleClose}>{Icons.userMinus}</button> : null }
                </div>
            </div>
        )
    }
}

class AnnotationRoomEntry extends Component {

    handleClick = () => {
        this.props.queryParams.set("focus", this.props.annotationContent.roomId)
        this.props.pushHistory({
            pageFocused : this.props.annotationContent.pageNumber,
            pdfFocused : this.props.parentRoom.name,
        })
    }
    
    creator = this.props.parentRoom.getMember(this.props.annotationContent.creator)

    render (props, state) { 
        return <tr class="annotationRoomEntry">
                <td>…&nbsp;<a onclick={this.handleClick}>{props.annotationContent.selectedText}</a>&nbsp;…</td>
                <td>{props.annotationContent.pageNumber}</td>
                <td><MemberPill member={this.creator}/></td>
            </tr>
    }
}
