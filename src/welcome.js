import { h, render, Fragment, Component } from 'preact';

export default class WelcomeView extends Component {

    render(props,state) {
        return (
            <Fragment>
                <RoomList client={props.client}/>
                <Logout/>
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
        const rooms = state.rooms.map(room => <RoomListing room={room}/>)
        return <div>{rooms}</div>
    }
}

class Logout extends Component {

    handleClick = (e) => {
            e.preventDefault()
            window.dispatchEvent(new CustomEvent('logout'))
    }

    render (props,state) {
        return (
            <footer>
                <a href='#' onclick={this.handleClick}>logout</a>
            </footer>
        )
    }
}

class RoomListing extends Component {
    render (props, state) {
        return (<div id={props.room.name}>{props.room.name}</div>)
    }
}
