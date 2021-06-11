import { h, Fragment } from 'preact';
import UserColor from './userColors.js'
import './styles/memberPill.css'

export default function UserPill(props) {
  const colorFromId = new UserColor(props.user.userId)
  return (<Fragment>
    <span style={{background: colorFromId.light}} class="memberPill">{props.user.displayName}</span>
    <wbr />
  </Fragment>
  )
}
