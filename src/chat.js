import * as sdk from "matrix-js-sdk"
import { h, Fragment, Component } from 'preact';

export default class Chat extends Component {
    constructor (props) {
        super(props)
        this.state = {
            typing : [],
            events : [],
            value : "",
            fullyScrolled : false,
        }
        this.scrolledIdents = new Set()
        this.handleTimeline = this.handleTimeline.bind(this)
        this.handleTypingNotifications = this.handleTypingNotification.bind(this)
    }

    componentDidMount() { 
        this.props.client.on("Room.timeline", this.handleTimeline) 
        this.props.client.on("RoomMember.typing", this.handleTypingNotification) 
    }

    componentWillUnmount() { 
        this.props.client.off("Room.timeline", this.handleTimeline) 
        this.props.client.off("RoomMember.typing", this.handleTypingNotification) 
    }

    handleTimeline = (event, room, toStart) => {
        if (this.props.focus && this.props.focus.room_id == event.getRoomId()) {
            this.setState({ 
                events : room.getLiveTimeline().getEvents() 
            })
        }
    }

    handleTypingNotification = (event,member) => {
        if (member.roomId == this.props.focus.room_id) {
            //^^^ we have to check the originating room in an odd way because
            //the room_id for the typing events isn't set for some reason,
            //maybe a bug in dendrite
            const myId = this.props.client.getUserId()
            const typingOtherThanMe = event.getContent().user_ids.filter(x => x != myId)
            this.setState({ typing : typingOtherThanMe })
        }
    }

    handleInput = (event) => this.setState({ value : event.target.value })


    handleKeypress = (event) => { 
        if (this.props.focus) {
            clearTimeout(this.typingTimeout)
            this.typingTimeout = setTimeout(_  => this.stopTyping(),5000)
            //send "stopped typing" after 5 seconds of inactivity
            if (event.key == "Enter") {
                event.preventDefault()
                if (this.props.focus.room_id) {
                    this.stopTyping()
                    this.props.client.sendMessage(this.props.focus.room_id,{ body : this.state.value ,"type":"m.text"})
                    this.setState({ value : "" })
                } else {
                    window.alert("you need to focus an annotation to send a message")
                }
            } else if (!this.typingLock) this.startTyping() 
        }
    }

    startTyping = () => {
        //send a "typing" notification with a 30 second timeout
        this.props.client.sendTyping(this.props.focus.room_id,true,30000)
        //lock sending further typing notifications 
        this.typingLock = true
        //Release lock (to allow sending another typing notification) after 10 seconds
        this.resetLockTimeout = setTimeout(_  => { this.typingLock = false },10000)
    }

    stopTyping = () => {
        //return to "waiting for typing" state
        this.typingLock = false;
        clearTimeout(this.resetLockTimeout)
        //send a "not typing" notification
        this.props.client.sendTyping(this.props.focus.room_id,false) 
    }

    tryLoad = (room) => {
        var anchor = document.getElementById("scroll-anchor")
        var chatPanel = document.getElementById("chat-panel")
        if (anchor && chatPanel.getBoundingClientRect().top - 5 < anchor.getBoundingClientRect().top) {
            this.props.client.scrollback(room)
            var oldState = room.getLiveTimeline().getState(sdk.EventTimeline.BACKWARDS)
            if (!oldState.paginationToken) { 
                this.scrolledIdents.add(this.props.focus.room_id)
                this.setState({ fullyScrolled : true }) 
            }
            setTimeout(_ => this.tryLoad(room),100)
        }
    }

    tryLoadRoom = async () => {
        const room = await this.props.client.joinRoom(this.props.focus.room_id)
        this.tryLoad(room)
    }

    async componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevProps.focus != this.props.focus) {
            const room = await this.props.client.joinRoom(this.props.focus.room_id)
            this.setState({ 
                fullyScrolled : this.scrolledIdents.has(this.props.focus.room_id),
                events : room.getLiveTimeline().getEvents(),
            }, _ => this.tryLoad(room))
        }
    }

    render(props, state) {
        const messages = state.events.filter(e => e.event.content.type == "m.text")
        const messagedivs = messages.map(event => <Message client={this.props.client} event={event}/>)
        

        return (
            <div id="chat-panel" onscroll={this.tryLoadRoom}>
                <textarea value={state.value} onkeypress={this.handleKeypress} oninput={this.handleInput}/>
                <div id="messages">
                {messagedivs} 
                <TypingIndicator client={this.props.client} typing={this.state.typing}/>
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

class TypingIndicator extends Component {
    render(props,state) {
        const shortids = props.typing.map(typer => typer.split(':')[0].slice(1))
        const howMany = shortids.length
        if (howMany == 0) {
            return <div class="typingIndicator">&nbsp;</div>
        } else if (howMany == 1) {
            return <div class="typingIndicator">{shortids[0]} is typing</div>
        } else if (howMany == 2) {
            return <div class="typingIndicator">{shortids[0]} and {shortids[1]} are typing</div>
        } else {
            return <div class="typingIndicator">several people are typing</div>
        }
    }
}

class Message extends Component {
    render(props,state) {
        const event = props.event
        const shortid = event.getSender().split(':')[0].slice(1)
        if (props.client.getUserId() == event.getSender()) {
            return (
                <div id={event.getId()} class="message me">
                <div class="body">{event.getContent().body}</div>
                <span class="name">{shortid}</span>
                </div>
            )
        } else {
            return (
                <div id={event.getId()} class="message">
                <span class="name">{shortid}</span>
                <div class="body">{event.getContent().body}</div>
                </div>
            )
        }
    }
}
