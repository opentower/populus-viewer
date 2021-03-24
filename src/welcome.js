import { h, render, Fragment, Component } from 'preact';
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
        props.client.on("Room", _ => {
            this.setState({ rooms : props.client.getVisibleRooms() })
        }) //TODO: remove listener on unmount
    }

    render(props,state) {
        //TODO: We're going to want to have different subcategories of rooms,
        //for actual pdfs, and for annotation discussions
        const rooms = state.rooms.map(room => <RoomListing {...props} room={room}/>)
        return (
            <Fragment>
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
        return (
            <div class="roomListingEntry" id={props.room.roomId}>
                <div>PDF:
                    <a onclick={_ => props.loadPDF(props.room.name)}>{props.room.name}</a>
                </div>
                <div>Last Active: {Date(props.room.getLastActiveTimestamp())}</div> 
            </div>
        )
    }
}

class AnnotationRoomEntry extends Component {
    render (props, state) {
        return (<div class="roomListingEntry" id={props.room.name}>{props.room.name}</div>)
    }
}
