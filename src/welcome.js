import { h, createRef, render, Fragment, Component } from 'preact';
import { pdfStateType }  from "./constants.js"
import * as Matrix from "matrix-js-sdk"
import UserColor from './userColors.js'
import * as Icons from './icons.js'
import { eventVersion }  from "./constants.js"
import './styles/welcome.css'

export default class WelcomeView extends Component {

    constructor(props) {
        super(props)
        this.state = {
            uploadVisible : false,
            inputFocus : false,
            searchFilter : ""
        }
        let userId = props.client.getUserId()
        this.userColor = new UserColor(userId)
        this.initial = userId.slice(1,2)
    }

    toggleUploadVisible = _ => this.setState({uploadVisible : !this.state.uploadVisible})

    hideUploadVisible = _ => this.setState({uploadVisible : false})

    handleInputFocus = _ => this.setState({inputFocus: true, uploadVisible: false})

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
                                <div style={this.userColor.styleVariables} id="welcome-profile">
                                    <div id="welcome-initial">
                                        {this.initial}
                                    </div>
                                </div>
                        </Fragment>}
                    </div>
                </header>
                <div id="welcome-container">
                    {state.uploadVisible 
                    ? <Fragment>
                         <h2>Upload a new PDF</h2>
                         <PdfUpload hideUploadVisible={this.hideUploadVisible} client={props.client}/>
                      </Fragment>
                    : <Fragment>
                        <h2>Conversations</h2>
                        <RoomList searchFilter={state.searchFilter} {...props}/>
                      </Fragment>
                    }
                    <Logout logoutHandler={props.logoutHandler}/>
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
        //State events might cause excessive rerendering, but we can optimize for that later
    }

    componentWillUnmount () { 
        this.props.client.off("Room", this.roomListener) 
        this.props.client.off("Room.name", this.roomListener) 
        this.props.client.on("RoomState.events",this.roomListener)
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
                                  }).map(room => { return <RoomListing loadPDF={props.loadPDF} client={props.client} room={room}/> })
        return (
            <Fragment>
                <div>{rooms}</div>
            </Fragment>
        )
    }
}

class Logout extends Component {
    render (props,state) {
        return (
            <footer>
                <a href='#' onclick={props.logoutHandler}>logout</a>
            </footer>
        )
    }
}

class RoomListing extends Component {
    render (props, state) {
        var pdfEvent = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS).getStateEvents("org.populus.pdf","")
        if (pdfEvent) return (<PDFRoomEntry loadPDF={props.loadPDF} client={props.client} room={props.room} pdfevent={pdfEvent}/>)
        else return (<AnnotationRoomEntry room={props.room}/>)
    }
}

class PDFRoomEntry extends Component {
    render (props, state) {
        const date = new Date(props.room.getLastActiveTimestamp())
        const members = props.room.getJoinedMembers()
        const memberIds = members.map(member => member.userId)
        const memberPills = members.map(member => <MemberPill member={member}/>)
        const clientId = props.client.getUserId()
        var status = "invited"
        if (memberIds.includes(clientId)) { status = "joined" }
        return (
            <div key={props.room.roomId} data-room-status={status} class="roomListingEntry" id={props.room.roomId}>
                <div><a onclick={_ => props.loadPDF(props.room.name)}>{props.room.name}</a>
                </div>
                <div>Members: {memberPills} </div>
                <div>Last Active: {date.toDateString()}, {date.toTimeString()}</div> 
            </div>
        )
    }
}

class MemberPill extends Component {
    render (props, state) {
        const colorFromId = new UserColor(props.member.userId)
        return (<Fragment>
                <span style={{background:colorFromId.light}} class="memberPill">{props.member.userId}</span>
                    <wbr></wbr> 
                </Fragment>
        )
    }
}

class AnnotationRoomEntry extends Component {
    render (props, state) {
        return (<div key={props.room.roomId} class="roomListingEntry" id={props.room.name}>{props.room.name}</div>)
    }
}

class PdfUpload extends Component {

    constructor(props) {
        super(props)
    }

    mainForm = createRef()

    fileLoader = createRef()
     
    roomNameInput = createRef()

    roomTopicInput = createRef()

    uploadFile = async (e) => { 
        e.preventDefault()
        const theFile = this.fileLoader.current.files[0]
        const theName = this.roomNameInput.current.value
        const theTopic = this.roomTopicInput.current.value
        if (theFile.type == "application/pdf") {
            const id = await this.props.client.createRoom({
                room_alias_name : theName,
                visibility : "public",
                name : theName,
                topic : theTopic,
                //We declare the room a space
                creation_content: {
                    "org.matrix.msc1772.type" : "org.matrix.msc1772.space"
                },
                //we allow anyone to join, by default, for now
                initial_state : [{
                    type : "m.room.join_rules",
                    state_key : "",
                    content : {"join_rule": "public"}
                }],
                power_level_content_override : {
                    events : {
                        [eventVersion] : 0 //we allow anyone to annotate, by default, for now
                    }
                }
            })
            this.props.client.uploadContent(theFile).then(e => {
                let parts = e.split('/')
                this.props.client.sendStateEvent(id.room_id, pdfStateType, {
                    "identifier": parts[parts.length - 1] 
                })
                //XXX: this event doesn't get through before the name is
                //assigned, so the room isn't detected as a pdf room. Probably
                //need to include the pdf in the room's creation event to make
                //this work right.
            }).then(_ => {
                this.mainForm.current.reset()
                this.props.hideUploadVisible()
            })
        }
    } 

    render (props, state) {
        return (
            <form id="pdfUploadForm" ref={this.mainForm} onsubmit={this.uploadFile}>
                    <label> Pdf to discuss</label>
                    <input ref={this.fileLoader} type="file"/>
                    <label>Name for Discussion</label>
                    <input ref={this.roomNameInput} type="text"/>
                    <label>Topic of Discussion</label>
                    <textarea ref={this.roomTopicInput} type="text"/>
                    <div><input value="Create Discussion" type="submit"/></div>
            </form>
        )
    }
}
