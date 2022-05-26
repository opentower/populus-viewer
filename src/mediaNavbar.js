import { h, createRef, Component } from 'preact';
import * as Icons from './icons.js';
import * as Matrix from "matrix-js-sdk"
import { spaceChild } from "./constants.js"
import ToolTip from "./utils/tooltip.js"
import './styles/navbar.css';
import History from './history.js'
import Resource from "./utils/resource.js"
import Client from './client.js'
import { toClockTime } from "./utils/temporal.js"
import Modal from './modal.js'
import Invite from './invite.js'

export default class MediaNavbar extends Component {
  constructor(props) {
    super(props);
    // Could add a listener to update this live
    const roomState = props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    this.canAnnotate = roomState.maySendStateEvent(spaceChild, Client.client.getUserId())
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeydown)
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeydown)
  }

  handleKeydown = e => {
    if (e.key === 'j') this.props.content.current.scrubRight()
    if (e.key === 'k') this.props.content.current.scrubLeft()
    if (e.key === "ArrowRight") this.props.content.current.selRight()
    if (e.key === "ArrowLeft") this.props.content.current.selLeft()
    if (e.key === ' ' || e.key === "Spacebar") this.props.content.current.playPause()
  }

  timeCurrent = createRef()

  timeTotal = createRef()

  toolTipOffset = [0, 30]

  mainMenu = _ => History.push("/")

  download = _ => {
    if (confirm("do you want to download the file you're annotating?")) {
      const file = new Resource(this.props.room)
      window.open(file.httpUrl)
    }
  }

  play = _ => this.props.content.current.play()

  pause = _ => this.props.content.current.pause()

  toggleMoreOptions = _ => {
    if (this.state.moreOptionsVisible) this.props.setNavHeight(75)
    else this.props.setNavHeight(150)
    this.setState(oldState => { return {moreOptionsVisible: !oldState.moreOptionsVisible} })
  }

  openInvite = _ => Modal.set(<Invite room={this.props.room} />, "Manage Membership", `for ${this.props.room.name}`)

  render(props, state) {

    const annotationStatus = !props.hasSelection 
      ? "Long press on waveform to select"
      : !this.canAnnotate
      ? "Annotation restricted"
      : false

    if (props.contentWidthPx) { // don't render until width is set
      return <nav id="page-nav">
        <div id="nav-background" />
        <div class="nav-button-wrapper top-wrapper">
          <ToolTip content="Go to main menu (ESC)" offset={this.toolTipOffset}>
            <button onclick={this.mainMenu}>{Icons.home}</button>
          </ToolTip>
          <ToolTip content={annotationStatus || "Add annotation (Alt + a)"} offset={this.toolTipOffset} >
            <div class="nav-button-tip-wrapper">
              <button disabled={annotationStatus ?  "disabled": null}
                onclick={props.openAnnotation}>{Icons.addAnnotation}
              </button>
            </div>
          </ToolTip>
          <ToolTip content="Go to previous annotation (Alt + Shift + Tab)" offset={this.toolTipOffset}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusPrev}>{Icons.chevronsLeft}
            </button>
          </ToolTip>
          <ToolTip content="Play" offset={this.toolTipOffset}>
            <button onclick={this.play}>{Icons.playButton}
            </button>
          </ToolTip>
          <Progress 
            resourceAlias={props.resourceAlias}
            timeStamp={props.timeStamp}
            content={props.content}
            total={props.total} 
            roomFocused={props.roomFocused}
          />
          <ToolTip content="Pause" offset={this.toolTipOffset}>
            <button onclick={this.pause}>{Icons.pauseButton}
            </button>
          </ToolTip>
          <ToolTip content="Go to next annotation (Alt + Tab)" offset={[0, 30]}>
            <button disabled={!props.hasAnnotations}
              onclick={props.focusNext}>{Icons.chevronsRight}
            </button>
          </ToolTip>
          <ToolTip content="Remove annotation (Alt + r)" offset={this.toolTipOffset}>
            <button disabled={props.focus && !props.hasSelection ? null : "disabled"}
              onclick={props.closeAnnotation}>{Icons.removeAnnotation}
            </button>
          </ToolTip>
          <ToolTip content="More options" offset={this.toolTipOffset}>
            <button onClick={this.toggleMoreOptions}>{Icons.moreVertical}</button>
          </ToolTip>
        </div>
        <div ref={this.bottomWrapper} data-searchFocused={state.searchFocused} class="nav-button-wrapper bottom-wrapper">
          <ToolTip content="Manage membership" theme="bordered">
            <button onClick={this.openInvite}>{Icons.userPlus}
            </button>
          </ToolTip>
          <ToolTip content="Download PDF" theme="bordered">
            <button onClick={this.download}>{Icons.download} </button>
          </ToolTip>
          <ToolTip content="Toggle annotation visibility (Alt + v)" theme="bordered">
            <button onClick={props.toggleAnnotations}>{props.annotationsVisible ? Icons.eyeOff : Icons.eye}</button>
          </ToolTip>
        </div>
      </nav>
    }
  }
}

class Progress extends Component {
  componentDidMount() {
    this.props.content.current.wavesurfer.on("audioprocess", this.updateTime)
    // don't need to take off, wavesurfer is destroyed when view changes
  }

  updateTime = _ => {
    if (this.updateLock) return
    this.updateLock = true
    const timeSec = Math.floor(this.props.content.current.wavesurfer.getCurrentTime())
    const focus = this.props.roomFocused
    if (focus) History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${timeSec}/${focus}`)
    else History.replace(`/${encodeURIComponent(this.props.resourceAlias)}/${timeSec}/`)
    setTimeout(_ => this.updateLock = false, 1000)
  }

  render(props) {
    const timeStamp = toClockTime(props.timeStamp)
    const timeTotal = toClockTime(props.total)
    return <div class="nav-position">
      <span ref={this.timeCurrent} style={{width: `${timeStamp.length + .5 }ch`}} id="nav-time-elapsed">{timeStamp}</span>
      <span>/</span>
      <span ref={this.timeTotal} style={{width: `${timeTotal.length + .5}ch`}} id="nav-time-total">{timeTotal}</span>
    </div>
  }
}
