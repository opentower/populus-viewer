import * as sdk from "matrix-js-sdk"
import { h, Fragment, Component } from 'preact';

export default class Chat extends Component {
    constructor (props) {
        super(props)
        this.state = {
            events : [],
            value : "",
            fullyScrolled : false,
        }
        this.scrolledIdents = new Set()
        this.handleTimeline = this.handleTimeline.bind(this)
    }

    componentDidMount() { this.props.client.on("Room.timeline", this.handleTimeline) }

    componentWillUnmount() { this.props.client.off("Room.timeline", this.handleTimeline) }

    handleTimeline = (event, room, toStart) => {
        if (this.props.focus && this.props.focus.room_id == event.event.room_id) {
            this.setState({ 
                events : room.getLiveTimeline().getEvents() 
            })
        }
    }

    handleInput = (event) => this.setState({ value : event.target.value })

    handleKeypress = (event) => { 
        if (event.key == "Enter") {
            event.preventDefault()
            if (this.props.focus.room_id) {
                this.props.client.sendMessage(this.props.focus.room_id,{ body : this.state.value ,"type":"m.text"})
                this.setState({ value : "" })
            } else {
                window.alert("you need to focus an annotation to send a message")
            }
        }
    }

    tryLoad = _ => {
        var anchor = document.getElementById("scroll-anchor")
        var chatPanel = document.getElementById("chat-panel")
        if (anchor && chatPanel.getBoundingClientRect().top - 5 < anchor.getBoundingClientRect().top) {
            var room = this.props.client.getRoom(this.props.focus.room_id)
            this.props.client.scrollback(room)
            var oldState = room.getLiveTimeline().getState(sdk.EventTimeline.BACKWARDS)
            if (!oldState.paginationToken) { 
                this.scrolledIdents.add(this.props.focus.room_id)
                this.setState({ fullyScrolled : true }) 
            }
            setTimeout(this.tryLoad,100)
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevProps.focus != this.props.focus) {
            var room = this.props.client.getRoom(this.props.focus.room_id)
            this.setState({ 
                fullyScrolled : this.scrolledIdents.has(this.props.focus.room_id),
                events : room.getLiveTimeline().getEvents(),
            },this.tryLoad)
        }
    }

    render(props, state) {
        const messages = state.events.filter(e => e.event.content.type == "m.text")
        const messagedivs = messages.map(event => <Message client = {this.props.client} event = {event}/>)

        return (
            <div id="chat-panel" onscroll={this.tryLoad}>
                <textarea value={state.value} onkeypress={this.handleKeypress} oninput={this.handleInput}/>
                <div id="messages">
                {messagedivs} 
                </div>
                <Anchor focus={props.focus} fullyScrolled={state.fullyScrolled}/>
            </div>
        )
    }
}

class Anchor extends Component {
    render(props) {
        if (props.fullyScrolled) return <div>All events loaded</div>
        else if (!props.focus) return <div>Click an annotation to discuss</div>
        else return <div id="scroll-anchor">loading...</div>
    }
}

class Message extends Component {
    render(props,state) {
        const event = props.event
        const shortid = event.event.sender.split(':')[0].slice(1)
        if (props.client.getUserId() == event.event.sender) {
            return (
                <div id={event.event.event_id} class="message me">
                <div class="body">{event.event.content.body}</div>
                <span class="name">{shortid}</span>
                </div>
            )
        } else {
            return (
                <div id={event.event.event_id} class="message">
                <span class="name">{shortid}</span>
                <div class="body">{event.event.content.body}</div>
                </div>
            )
        }
    }
}
