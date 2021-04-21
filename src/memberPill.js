import { h, render, Fragment, Component } from 'preact';
import UserColor from './userColors.js'
import './styles/memberPill.css'

export default class MemberPill extends Component {
    render (props, state) {
        const colorFromId = new UserColor(props.member.userId)
        return (<Fragment>
                <span style={{background:colorFromId.light}} class="memberPill">{props.member.name}</span>
                    <wbr></wbr> 
                </Fragment>
        )
    }
}
