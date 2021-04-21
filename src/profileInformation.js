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

    removeAvatar = _ => this.setState({ previewUrl : null })

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
            await this.props.client.setProfileInfo("avatar_url", {avatar_url : "null"})
            //XXX this is a pretty awful hack. Discussion at https://github.com/matrix-org/matrix-doc/issues/1674
        }
        this.mainForm.current.reset()
        this.props.showMainView()
    } 

    render (props, state) {
        return (
            <form id="profileInformationForm" ref={this.mainForm} onsubmit={this.updateProfile}>
                <label>My Display Name</label>
                <input placeholder={state.displayName} ref={this.displayNameInput} type="text"/>
                <div id="profileInformationAvatarControls">
                    <label>My Avatar
                    </label>
                    {state.previewUrl ? <input onclick={this.removeAvatar} value="Remove Avatar" type="button"/> : null}
                </div>
                {state.previewUrl 
                    ? <img onclick={this.uploadAvatar} id="profileSelector" src={state.previewUrl}/> 
                    : <div onclick={this.uploadAvatar} id="profileSelector"/>}
                <input id="profileInformationFormHidden" onchange={this.updatePreview} ref={this.avatarImageInput} type="file"/>
                <div id="profileInformationFormSubmit">
                    <input ref={this.submitButton} value="Update Profile" type="submit"/>
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
