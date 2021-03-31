import { h, createRef, render, Fragment, Component } from 'preact';
import { pdfStateType }  from "./constants.js"
import * as Matrix from "matrix-js-sdk"

export default class WelcomeView extends Component {

    render(props,state) {
        return (
            <Fragment>
                <RoomList {...props}/>
                <Logout logoutHandler={props.logoutHandler}/>
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
        const rooms = state.rooms.sort((a,b) => { 
                                        const ts1 = a.getLastActiveTimestamp() 
                                        const ts2 = b.getLastActiveTimestamp()
                                        if (ts1 < ts2) return 1
                                        else if (ts2 < ts1) return -1
                                        else return 0
                                  }).map(room => { return <RoomListing {...props} room={room}/> })

        return (
            <Fragment>
                <h3>Upload a new PDF</h3>
                <PdfUpload client={props.client}/>
                <h3>Current Conversations</h3>
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
        if (pdfEvent) return (<PDFRoomEntry {...props} pdfevent={pdfEvent}/>)
        else return (<AnnotationRoomEntry room={props.room}/>)
    }
}

class PDFRoomEntry extends Component {
    render (props, state) {
        const date = new Date(props.room.getLastActiveTimestamp())
        return (
            <div class="roomListingEntry" id={props.room.roomId}>
                <div>PDF:
                    <a onclick={_ => props.loadPDF(props.room.name)}>{props.room.name}</a>
                </div>
                <div>Last Active: {date.toDateString()}, {date.toTimeString()}</div> 
            </div>
        )
    }
}

class AnnotationRoomEntry extends Component {
    render (props, state) {
        return (<div class="roomListingEntry" id={props.room.name}>{props.room.name}</div>)
    }
}

class PdfUpload extends Component {

    constructor(props) {
        super(props)
    }

    mainForm = createRef()

    fileLoader = createRef()
     
    roomNameInput = createRef()

    uploadFile = async (e) => { 
        e.preventDefault()
        const theFile = this.fileLoader.current.files[0]
        const theName = this.roomNameInput.current.value
        if (theFile.type == "application/pdf") {
            const id = await this.props.client.createRoom({
                room_alias_name : theName,
                visibility : "public",
                name : theName,
                topic : "talkin' bout ..." + theName,
                creation_content: {
                    type: "space"
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
            }).then(_ => this.mainForm.current.reset())
        }
    } 

    render (props, state) {
        return (
            <form ref={this.mainForm} onsubmit={this.uploadFile}>
                <div>
                    <label> Pdf to discuss
                        <input ref={this.fileLoader}  type="file"/>
                    </label>
                </div>
                <div>
                    <label> Name to give discussion
                        <input ref={this.roomNameInput} type="text"></input>
                    </label>
                </div>
                <input type="submit">Create</input>
            </form>
        )
    }
}
