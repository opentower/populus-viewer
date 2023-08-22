import { h, Component, Fragment } from 'preact';
import * as Matrix from "matrix-js-sdk"
import Client from './client.js'
import Modal from './modal.js'
import Resource from './utils/resource.js'

export default class LeaveRoom extends Component {
  leaveRoom = async _ => {
    await Client.client.leave(this.props.room.roomId)
    Modal.hide()
  }

  forgetRoom = async _ => {
    await Client.client.leave(this.props.room.roomId)
    await Client.client.forget(this.props.room.roomId)
    Modal.hide()
  }

  sort = Resource.hasResource(this.props.room)
    ? "discussion"
    : this.props.room.isSpaceRoom()
    ? "collection"
    : "annotation"

  deepForget = async _ => {
    const theState = this.props.room.getLiveTimeline().getState(Matrix.EventTimeline.FORWARDS)
    const theChildren = theState.getStateEvents(Matrix.EventType.SpaceChild)
      .filter(child => Client.client.getRoom(child.getStateKey()))
    await new Promise(res => this.setState({progress:0, childTotal:theChildren.length}, res))
    for (const child of theChildren) {
      await Client.client.leave(child.getStateKey())
      await Client.client.forget(child.getStateKey())
      await new Promise(res => this.setState(oldState => ({progress:oldState.progress + 1}), res))
    }
    this.forgetRoom()
  }

  render(_props,state) {
    return <div>
      <p>
        Щоб припинити отримувати сповіщення від лікаря по цій карті, та видалити її з  списку мед. карт.</p>
      <button onClick={this.leaveRoom} class="styled-button">Видалити з списку мед. карт </button>
      <p>
        Щоб також видалити всю збережену історію спілкування з лікарем.
      </p>
      <button onClick={this.forgetRoom} class="styled-button">Видалити з списку мед. карт та очистити історію.</button>
      { this.sort === "discussion" 
        ? <><p>
            Повністю видалити цей <i> запис, всі пов'язані з ним анотації.</i>:
          </p>
          <button onClick={this.deepForget} class="styled-button">Знищити запис</button>
          {state.childTotal && <p> Forgetting: {state.progress} / {state.childTotal} </p>}
        </>
        : null
      }
    </div>
  }
}
