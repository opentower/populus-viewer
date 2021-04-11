import * as sdk from "matrix-js-sdk"
import { h, Fragment, Component } from 'preact';
import './styles/chat.css'
import * as CommonMark from 'commonmark'
import * as Icons from "./icons.js"
import { addLatex } from './latex.js'
import Message from './message.js'
import UserColor from './userColors.js'

export default class Chat extends Component {
    constructor (props) {
        super(props)
        this.state = {
            typing : [],
            events : [],
            fullyScrolled : false,
        }
        this.scrolledIdents = new Set()
        this.handleTimeline = this.handleTimeline.bind(this)
        this.handleTypingNotifications = this.handleTypingNotification.bind(this)
    }

    componentDidMount() { 
        this.props.client.on("Room.timeline", this.handleTimeline) 
        this.props.client.on("Room.redaction", this.handleTimeline) 
        this.props.client.on("RoomMember.typing", this.handleTypingNotification) 
    }

    componentWillUnmount() { 
        this.props.client.off("Room.timeline", this.handleTimeline) 
        this.props.client.off("Room.redaction", this.handleTimeline) 
        this.props.client.off("RoomMember.typing", this.handleTypingNotification) 
    }

    //Room.timeline passes in more params
    handleTimeline = (event, room) => {
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
        var reactions = {}
        //XXX need to be able to handle other message types
        const messages = state.events.filter(e => e.getType() == "m.room.message" 
                                                  && e.getContent().msgtype == "m.text"
                                                  || (Object.keys(e.getContent()).length == 0))
        var prev = null
        const messagedivs = messages.reduce((accumulator,event) => {
            if (!prev || prev.getSender() != event.getSender()) {
                accumulator.push(<UserInfoMessage key={event.getId() + "-userinfo"}
                                                  username={event.getSender()}
                                                  isMe={event.getSender() == props.client.getUserId()}/>)
                prev = event
            } else {
                switch(event.getContent().msgtype) {
                    case "m.text": {
                        accumulator.push (<Message reactions={reactions} 
                                                   client={this.props.client} 
                                                   key={event.getId()}
                                                   event={event}/>)
                        break;
                    }
                    case undefined: {
                        if (prev.getSender() == event.getSender() 
                            && accumulator.length > 1 
                            && accumulator[accumulator.length - 1].type == RedactedMessage) {
                            accumulator[accumulator.length - 1].props.count = accumulator[accumulator.length - 1].props.count + 1
                        }
                        else { accumulator.push (<RedactedMessage count={1}
                                                           key={event.getId()}
                                                           username={event.getSender()}
                                                           isMe={event.getSender() == props.client.getUserId()}/>)
                        }
                        break;
                    }
                }
            }

            return accumulator
        },[])
        //sort reactions by event reacted-to
        state.events.forEach(e => { if (e.getType() == "m.reaction") {
            if (reactions[e.getContent()["m.relates_to"].event_id]) reactions[e.getContent()["m.relates_to"].event_id].push(e) 
            else reactions[e.getContent()["m.relates_to"].event_id] = [e]
        }})
        //the chat wrapper works around a nasty positioning bug in chrome - it
        //has height set, so that we don't need to set height on the flexbox element
        return (
            <div id="chat-wrapper">
                <div id="chat-panel" onscroll={this.tryLoadRoom}>
                    <MessagePanel textarea={this.messageTextarea} client={props.client} focus={props.focus} />
                    <div id="messages">
                        {messagedivs} 
                        <TypingIndicator client={this.props.client} typing={this.state.typing}/>
                    </div>
                    <Anchor focus={props.focus} fullyScrolled={state.fullyScrolled}/>
                </div>
            </div>
        )
    }
}

class UserInfoMessage extends Component {

    userColor = new UserColor(this.props.username)

    render(props) {
        const theClass = props.isMe ? "user-info-message me" : "user-info-message"
        return <div class={theClass} style={this.userColor.styleVariables}>{props.username}</div>
    }
}

class RedactedMessage extends Component {

    userColor = new UserColor(this.props.username)

    render(props) {
        return props.isMe  
            ? <div class="redacted message me" style={this.userColor.styleVariables}>
                        <div class="ident"/>
                        <div class="body">{props.count > 1 ? props.count + " messages deleted" : "message deleted"}</div>
              </div>
            : <div class="redacted message" style={this.userColor.styleVariables}>
                        <div class="ident"/>
                        <div class="body">{props.count > 1 ? props.count + " messages deleted" : "message deleted"}</div>
              </div>
    }
}

class Anchor extends Component {
    render(props) {
        if (props.fullyScrolled) return <div id="scroll-done">All events loaded</div>
        else if (!props.focus) return <div id="scroll-done">Click an annotation to discuss</div>
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

class MessagePanel extends Component {
    constructor (props) {
        super(props)
        this.state = {
            value : "",
        }
        this.reader = new CommonMark.Parser()
        this.writer = new CommonMark.HtmlRenderer()
    }

    startTyping = () => {
        //send a "typing" notification with a 30 second timeout
        this.props.client.sendTyping(this.props.focus.room_id,true, 30000)
        //lock sending further typing notifications 
        this.typingLock = true
        //Release lock (to allow sending another typing notification) after 10 seconds
        this.resetLockTimeout = setTimeout(_  => { this.typingLock = false }, 10000)
    }

    stopTyping = () => {
        //return to "waiting for typing" state
        this.typingLock = false;
        clearTimeout(this.resetLockTimeout)
        clearTimeout(this.typingTimeout)
        //send a "not typing" notification
        this.props.client.sendTyping(this.props.focus.room_id,false) 
    }

    handleInput = (event) => {
        if (event.target.value == "" && this.props.focus) this.stopTyping()
        this.setState({ value : event.target.value })
    }

    handleKeypress = (event) => { 
        if (this.props.focus) {
            clearTimeout(this.typingTimeout)
            this.typingTimeout = setTimeout(_  => this.stopTyping(), 5000)
            //send "stopped typing" after 5 seconds of inactivity
            if (event.key == "Enter" && event.ctrlKey) {
                event.preventDefault()
                this.sendMessage()
            } else if (!this.typingLock) this.startTyping() 
        }
    }

    sendMessage = () => {
        if (this.props.focus.room_id) {
            this.stopTyping()
            const parsed = this.reader.parse(addLatex(this.state.value))
            const rendered = this.writer.render(parsed)
            this.props.client.sendMessage(this.props.focus.room_id,{ 
                body : this.state.value,
                msgtype :"m.text",
                format: "org.matrix.custom.html",
                formatted_body : rendered
            })
            this.setState({ value : "" })
        } else {
            window.alert("you need to focus an annotation to send a message")
        }
    }

    userColor = new UserColor(this.props.client.getUserId())

    render(props,state) {
        return (<div style={this.userColor.styleVariables} id="messageComposer">
            <textarea value={state.value} onkeypress={this.handleKeypress} oninput={this.handleInput}/>
            <div id="submit-button-wrapper">
                <button id="submitButton" onclick={this.sendMessage}>Submit</button>
                <button id="sendFileButton" onclick={_ => alert("not implemented")}>{Icons.upload}</button>
                <button id="sendImageButton" onclick={_ => alert("not implemented")}>{Icons.image}</button>
                <button id="moreButton" onclick={_ => alert("not implemented")}>{Icons.moreHorizontal}</button>
            </div>
        </div>)
    }
}
