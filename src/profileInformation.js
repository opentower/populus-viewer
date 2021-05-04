import { h, createRef, render, Component } from 'preact';
import * as Matrix from "matrix-js-sdk"
import './styles/profileInformation.css'
import { serverRoot }  from "./constants.js"

export default class ProfileInfomation extends Component {

    constructor(props) {
        super(props)
        const me = props.client.getUser(props.client.getUserId())
        this.state = {
            previewUrl : Matrix.getHttpUriForMxc(serverRoot, me.avatarUrl, 180, 180, "crop"),
            displayName : me.displayName,
        }
    }

    displayNameInput = createRef()

    avatarImageInput = createRef()

    submitButton = createRef()

    mainForm = createRef()

    progressHandler = (progress) => this.setState({progress : progress})

    uploadAvatar = _ => this.avatarImageInput.current.click()

    removeAvatar = e => this.setState({ previewUrl : null })

    updatePreview = _ => {
        const theImage = this.avatarImageInput.current.files[0]
        if (theImage && /^image/.test(theImage.type)) {
            this.setState({previewUrl : URL.createObjectURL(this.avatarImageInput.current.files[0]) })
        }
    }

    updateProfile = async (e) => { 
        e.preventDefault()
        const theImage = this.avatarImageInput.current.files[0]
        const theDisplayName = this.displayNameInput.current.value
        this.submitButton.current.setAttribute("disabled", true)
        if (theDisplayName) await this.props.client.setDisplayName(theDisplayName)
        if (theImage && /^image/.test(theImage.type)) {
            await this.props.client.uploadContent(theImage, { progressHandler : this.progressHandler })
                      .then(e => this.props.client.setAvatarUrl(e))
        } else if (!this.state.previewUrl) {
            await this.props.client.setAvatarUrl("null")
            //XXX this is a pretty awful hack. Discussion at https://github.com/matrix-org/matrix-doc/issues/1674
        }
        this.mainForm.current.reset()
        this.props.showMainView()
    } 

    render (props, state) {
        //We include some key attributes here, because the removal and
        //insertion of divs causes click events to get handled by the wrong
        //elements as they bubble up through the DOM otherwise
        return (
            <form id="profileInformationForm" ref={this.mainForm} onsubmit={this.updateProfile}>
                <label>My Display Name</label>
                <input placeholder={state.displayName} ref={this.displayNameInput} type="text"/>
                <label>My Avatar</label>
                {state.previewUrl 
                    ? <img onclick={this.uploadAvatar} id="profileSelector" src={state.previewUrl}/> 
                    : <div key="profileSelector" onclick={this.uploadAvatar} id="profileSelector"/>}
                <input id="profileInformationFormHidden" onchange={this.updatePreview} ref={this.avatarImageInput} type="file"/>
                <div key="profileInformationFormSubmit" id="profileInformationFormSubmit">
                    <button class="styled-button" ref={this.submitButton} type="submit">Update Profile</button>
                    {state.previewUrl ? <button class="styled-button" type="button" onclick={this.removeAvatar}>Remove Avatar</button> : null}
                    <button class="styled-button" type="button" onclick={props.logoutHandler}>Logout</button>
                </div>
                {this.state.progress 
                    ?  <div id="profileInformationFormProgress">
                          <span>{this.state.progress.loaded} bytes</span>
                          <span> out of </span>
                          <span>{this.state.progress.total} bytes</span>
                       </div>
                    : null
                }
            </form>
        )
    }
}
