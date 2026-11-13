import React from 'react';
import { Image, View } from 'react-native';
import { UnGlyph as UniconGlyph, type GlyphName, type Icon, type IconProps } from '@unifesto/unicon/react-native';
import { useCosmos } from '../../theme/cosmos';

export type { GlyphName, Icon, IconProps, IconWeight } from '@unifesto/unicon/react-native';

/**
 * The app's icons: sonnycandra's gradient outline set from Flaticon (owner,
 * 13 Nov 2026), 128px PNGs in assets/icons/app, painted one colour with
 * `tintColor`. Same names and props as @unifesto/unicon, so screens import from
 * here instead. Outline only (owner's choice): `weight` is ignored, and the few
 * glyphs with no sonnycandra match render Unicon at regular weight. Free
 * Flaticon licence: the credit on About must stay while these ship. Built from
 * the mapping the owner approved; add a glyph by dropping its 128px PNG in
 * assets/icons/app and a line in ASSETS (and an export below if it's named).
 */
const ASSETS: Partial<Record<GlyphName, number>> = {
  'arrow-circle-up': require('../../../assets/icons/app/arrow-circle-up.png'),
  'arrow-counter-clockwise': require('../../../assets/icons/app/arrow-counter-clockwise.png'),
  'arrow-right': require('../../../assets/icons/app/arrow-right.png'),
  'arrow-up-right': require('../../../assets/icons/app/arrow-up-right.png'),
  'arrows-clockwise': require('../../../assets/icons/app/arrows-clockwise.png'),
  'arrows-left-right': require('../../../assets/icons/app/arrows-left-right.png'),
  'article': require('../../../assets/icons/app/article.png'),
  'bank': require('../../../assets/icons/app/bank.png'),
  'bell': require('../../../assets/icons/app/bell.png'),
  'bell-ringing': require('../../../assets/icons/app/bell-ringing.png'),
  'bell-simple': require('../../../assets/icons/app/bell-simple.png'),
  'briefcase': require('../../../assets/icons/app/briefcase.png'),
  'broadcast': require('../../../assets/icons/app/broadcast.png'),
  'buildings': require('../../../assets/icons/app/buildings.png'),
  'calendar-blank': require('../../../assets/icons/app/calendar-blank.png'),
  'calendar-dots': require('../../../assets/icons/app/calendar-dots.png'),
  'calendar-plus': require('../../../assets/icons/app/calendar-plus.png'),
  'calendar-x': require('../../../assets/icons/app/calendar-x.png'),
  'camera': require('../../../assets/icons/app/camera.png'),
  'caret-down': require('../../../assets/icons/app/caret-down.png'),
  'caret-left': require('../../../assets/icons/app/caret-left.png'),
  'caret-right': require('../../../assets/icons/app/caret-right.png'),
  'caret-up': require('../../../assets/icons/app/caret-up.png'),
  'certificate': require('../../../assets/icons/app/certificate.png'),
  'chart-bar': require('../../../assets/icons/app/chart-bar.png'),
  'chart-line-up': require('../../../assets/icons/app/chart-line-up.png'),
  'chats-circle': require('../../../assets/icons/app/chats-circle.png'),
  'check': require('../../../assets/icons/app/check.png'),
  'check-circle': require('../../../assets/icons/app/check-circle.png'),
  'clock-counter-clockwise': require('../../../assets/icons/app/clock-counter-clockwise.png'),
  'cloud-arrow-down': require('../../../assets/icons/app/cloud-arrow-down.png'),
  'cloud-arrow-up': require('../../../assets/icons/app/cloud-arrow-up.png'),
  'coffee': require('../../../assets/icons/app/coffee.png'),
  'credit-card': require('../../../assets/icons/app/credit-card.png'),
  'crown': require('../../../assets/icons/app/crown.png'),
  'desktop': require('../../../assets/icons/app/desktop.png'),
  'device-mobile': require('../../../assets/icons/app/device-mobile.png'),
  'door-open': require('../../../assets/icons/app/door-open.png'),
  'dots-three': require('../../../assets/icons/app/dots-three.png'),
  'download-simple': require('../../../assets/icons/app/download-simple.png'),
  'envelope-simple': require('../../../assets/icons/app/envelope-simple.png'),
  'export': require('../../../assets/icons/app/export.png'),
  'eye': require('../../../assets/icons/app/eye.png'),
  'eye-slash': require('../../../assets/icons/app/eye-slash.png'),
  'file-csv': require('../../../assets/icons/app/file-csv.png'),
  'file-text': require('../../../assets/icons/app/file-text.png'),
  'flag': require('../../../assets/icons/app/flag.png'),
  'flashlight': require('../../../assets/icons/app/flashlight.png'),
  'funnel': require('../../../assets/icons/app/funnel.png'),
  'gear': require('../../../assets/icons/app/gear.png'),
  'gear-six': require('../../../assets/icons/app/gear-six.png'),
  'gender-intersex': require('../../../assets/icons/app/gender-intersex.png'),
  'globe': require('../../../assets/icons/app/globe.png'),
  'hand-coins': require('../../../assets/icons/app/hand-coins.png'),
  'handshake': require('../../../assets/icons/app/handshake.png'),
  'heart': require('../../../assets/icons/app/heart.png'),
  'hourglass': require('../../../assets/icons/app/hourglass.png'),
  'hourglass-medium': require('../../../assets/icons/app/hourglass-medium.png'),
  'identification-card': require('../../../assets/icons/app/identification-card.png'),
  'image-square': require('../../../assets/icons/app/image-square.png'),
  'info': require('../../../assets/icons/app/info.png'),
  'lifebuoy': require('../../../assets/icons/app/lifebuoy.png'),
  'lightbulb': require('../../../assets/icons/app/lightbulb.png'),
  'lightning': require('../../../assets/icons/app/lightning.png'),
  'link': require('../../../assets/icons/app/link.png'),
  'link-break': require('../../../assets/icons/app/link-break.png'),
  'link-simple': require('../../../assets/icons/app/link-simple.png'),
  'list-bullets': require('../../../assets/icons/app/list-bullets.png'),
  'list-checks': require('../../../assets/icons/app/list-checks.png'),
  'list-numbers': require('../../../assets/icons/app/list-numbers.png'),
  'lock': require('../../../assets/icons/app/lock.png'),
  'lock-key': require('../../../assets/icons/app/lock-key.png'),
  'lock-open': require('../../../assets/icons/app/lock-open.png'),
  'lock-simple': require('../../../assets/icons/app/lock-simple.png'),
  'magnifying-glass': require('../../../assets/icons/app/magnifying-glass.png'),
  'map-pin': require('../../../assets/icons/app/map-pin.png'),
  'medal': require('../../../assets/icons/app/medal.png'),
  'megaphone': require('../../../assets/icons/app/megaphone.png'),
  'megaphone-simple': require('../../../assets/icons/app/megaphone-simple.png'),
  'minus': require('../../../assets/icons/app/minus.png'),
  'moon': require('../../../assets/icons/app/moon.png'),
  'navigation-arrow': require('../../../assets/icons/app/navigation-arrow.png'),
  'paint-brush': require('../../../assets/icons/app/paint-brush.png'),
  'paper-plane-right': require('../../../assets/icons/app/paper-plane-right.png'),
  'paper-plane-tilt': require('../../../assets/icons/app/paper-plane-tilt.png'),
  'paperclip': require('../../../assets/icons/app/paperclip.png'),
  'pause': require('../../../assets/icons/app/pause.png'),
  'pencil-simple': require('../../../assets/icons/app/pencil-simple.png'),
  'phone': require('../../../assets/icons/app/phone.png'),
  'play': require('../../../assets/icons/app/play.png'),
  'play-circle': require('../../../assets/icons/app/play-circle.png'),
  'plus': require('../../../assets/icons/app/plus.png'),
  'plus-circle': require('../../../assets/icons/app/plus-circle.png'),
  'power': require('../../../assets/icons/app/power.png'),
  'pulse': require('../../../assets/icons/app/pulse.png'),
  'qr-code': require('../../../assets/icons/app/qr-code.png'),
  'quotes': require('../../../assets/icons/app/quotes.png'),
  'receipt': require('../../../assets/icons/app/receipt.png'),
  'rocket-launch': require('../../../assets/icons/app/rocket-launch.png'),
  'seal-check': require('../../../assets/icons/app/seal-check.png'),
  'seal-percent': require('../../../assets/icons/app/seal-percent.png'),
  'share-network': require('../../../assets/icons/app/share-network.png'),
  'shield-check': require('../../../assets/icons/app/shield-check.png'),
  'shield-warning': require('../../../assets/icons/app/shield-warning.png'),
  'sign-out': require('../../../assets/icons/app/sign-out.png'),
  'sliders-horizontal': require('../../../assets/icons/app/sliders-horizontal.png'),
  'sparkle': require('../../../assets/icons/app/sparkle.png'),
  'stack': require('../../../assets/icons/app/stack.png'),
  'star': require('../../../assets/icons/app/star.png'),
  'stop': require('../../../assets/icons/app/stop.png'),
  'tag': require('../../../assets/icons/app/tag.png'),
  'terminal': require('../../../assets/icons/app/terminal.png'),
  'ticket': require('../../../assets/icons/app/ticket.png'),
  'timer': require('../../../assets/icons/app/timer.png'),
  'trash': require('../../../assets/icons/app/trash.png'),
  'tray': require('../../../assets/icons/app/tray.png'),
  'trophy': require('../../../assets/icons/app/trophy.png'),
  'user': require('../../../assets/icons/app/user.png'),
  'user-circle': require('../../../assets/icons/app/user-circle.png'),
  'user-focus': require('../../../assets/icons/app/user-focus.png'),
  'user-plus': require('../../../assets/icons/app/user-plus.png'),
  'users': require('../../../assets/icons/app/users.png'),
  'users-four': require('../../../assets/icons/app/users-four.png'),
  'users-three': require('../../../assets/icons/app/users-three.png'),
  'video-camera': require('../../../assets/icons/app/video-camera.png'),
  'wallet': require('../../../assets/icons/app/wallet.png'),
  'warning': require('../../../assets/icons/app/warning.png'),
  'warning-circle': require('../../../assets/icons/app/warning-circle.png'),
  'x': require('../../../assets/icons/app/x.png'),
  'x-circle': require('../../../assets/icons/app/x-circle.png'),
};

/** The PNGs fill more of their box than Unicon's glyphs; this keeps the old optical size. */
const SCALE = 0.8;

// Core Image, not expo-image: bundled assets draw on the first frame, like the SVGs did.
// SVG-only props (weight, duotone*) are dropped; anything else (testID, pointerEvents) reaches the box.
function Png({ source, size = 24, color, mirrored, style, accessibilityLabel, weight, duotoneColor, duotoneOpacity, ...rest }: IconProps & { source: number }) {
  const c = useCosmos();
  const box = Number(size) || 24;
  const inner = Math.round(box * SCALE);
  return (
    <View
      {...rest}
      style={[{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }, style, mirrored && { transform: [{ scaleX: -1 }] }]}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    >
      <Image source={source} style={{ width: inner, height: inner, tintColor: color ?? c.text }} resizeMode="contain" />
    </View>
  );
}

/** Any glyph by name: the sonnycandra PNG when there is one, else Unicon. */
export function UnGlyph({ name, ...props }: IconProps & { name: GlyphName }) {
  const source = ASSETS[name];
  return source ? <Png source={source} {...props} /> : <UniconGlyph name={name} {...props} weight="regular" />;
}

const glyph = (name: GlyphName): Icon => {
  const Component: Icon = (props) => <UnGlyph name={name} {...props} />;
  Component.displayName = name;
  return Component;
};

// Every named glyph the app imports.
export const XCircle = glyph('x-circle');
export const ArrowCircleUp = glyph('arrow-circle-up');
export const ArrowCounterClockwise = glyph('arrow-counter-clockwise');
export const ArrowRight = glyph('arrow-right');
export const ArrowUpRight = glyph('arrow-up-right');
export const ArrowsClockwise = glyph('arrows-clockwise');
export const ArrowsLeftRight = glyph('arrows-left-right');
export const Bank = glyph('bank');
export const Bell = glyph('bell');
export const BellRinging = glyph('bell-ringing');
export const Broadcast = glyph('broadcast');
export const Buildings = glyph('buildings');
export const CalendarBlank = glyph('calendar-blank');
export const CalendarDots = glyph('calendar-dots');
export const CalendarPlus = glyph('calendar-plus');
export const CalendarX = glyph('calendar-x');
export const Camera = glyph('camera');
export const CaretDown = glyph('caret-down');
export const CaretLeft = glyph('caret-left');
export const CaretRight = glyph('caret-right');
export const CaretUp = glyph('caret-up');
export const Certificate = glyph('certificate');
export const ChartBar = glyph('chart-bar');
export const ChatsCircle = glyph('chats-circle');
export const Check = glyph('check');
export const CheckCircle = glyph('check-circle');
export const ClockCounterClockwise = glyph('clock-counter-clockwise');
export const CloudArrowUp = glyph('cloud-arrow-up');
export const Coffee = glyph('coffee');
export const Crown = glyph('crown');
export const DoorOpen = glyph('door-open');
export const DownloadSimple = glyph('download-simple');
export const EnvelopeSimple = glyph('envelope-simple');
export const Export = glyph('export');
export const EyeSlash = glyph('eye-slash');
export const FileCsv = glyph('file-csv');
export const Flag = glyph('flag');
export const Flashlight = glyph('flashlight');
export const GearSix = glyph('gear-six');
export const GenderIntersex = glyph('gender-intersex');
export const Globe = glyph('globe');
export const Handshake = glyph('handshake');
export const Heart = glyph('heart');
export const Hourglass = glyph('hourglass');
export const IdentificationCard = glyph('identification-card');
export const ImageSquare = glyph('image-square');
export const Info = glyph('info');
export const Lifebuoy = glyph('lifebuoy');
export const Lightbulb = glyph('lightbulb');
export const Lightning = glyph('lightning');
export const Link = glyph('link');
export const LinkSimple = glyph('link-simple');
export const ListNumbers = glyph('list-numbers');
export const Lock = glyph('lock');
export const LockKey = glyph('lock-key');
export const LockOpen = glyph('lock-open');
export const LockSimple = glyph('lock-simple');
export const MagnifyingGlass = glyph('magnifying-glass');
export const MapPin = glyph('map-pin');
export const Megaphone = glyph('megaphone');
export const MegaphoneSimple = glyph('megaphone-simple');
export const Minus = glyph('minus');
export const NavigationArrow = glyph('navigation-arrow');
export const PaperPlaneRight = glyph('paper-plane-right');
export const PaperPlaneTilt = glyph('paper-plane-tilt');
export const Paperclip = glyph('paperclip');
export const Pause = glyph('pause');
export const PencilSimple = glyph('pencil-simple');
export const Phone = glyph('phone');
export const Play = glyph('play');
export const PlayCircle = glyph('play-circle');
export const Plus = glyph('plus');
export const PlusCircle = glyph('plus-circle');
export const Power = glyph('power');
export const QrCode = glyph('qr-code');
export const Quotes = glyph('quotes');
export const Receipt = glyph('receipt');
export const RocketLaunch = glyph('rocket-launch');
export const SealCheck = glyph('seal-check');
export const ShareNetwork = glyph('share-network');
export const ShieldCheck = glyph('shield-check');
export const ShieldWarning = glyph('shield-warning');
export const SlidersHorizontal = glyph('sliders-horizontal');
export const Sparkle = glyph('sparkle');
export const Stack = glyph('stack');
export const Star = glyph('star');
export const Stop = glyph('stop');
export const Tag = glyph('tag');
export const Ticket = glyph('ticket');
export const Timer = glyph('timer');
export const Trash = glyph('trash');
export const Tray = glyph('tray');
export const Trophy = glyph('trophy');
export const User = glyph('user');
export const UserCircle = glyph('user-circle');
export const UserFocus = glyph('user-focus');
export const UserPlus = glyph('user-plus');
export const UsersFour = glyph('users-four');
export const UsersThree = glyph('users-three');
export const VideoCamera = glyph('video-camera');
export const Wallet = glyph('wallet');
export const Warning = glyph('warning');
export const WarningCircle = glyph('warning-circle');
export const X = glyph('x');

export const Article = glyph('article');
export const BellSimple = glyph('bell-simple');
export const Briefcase = glyph('briefcase');
export const ChartLineUp = glyph('chart-line-up');
export const CloudArrowDown = glyph('cloud-arrow-down');
export const CreditCard = glyph('credit-card');
export const DeviceMobile = glyph('device-mobile');
export const DotsThree = glyph('dots-three');
export const Eye = glyph('eye');
export const Funnel = glyph('funnel');
export const HandCoins = glyph('hand-coins');
export const HourglassMedium = glyph('hourglass-medium');
export const ListBullets = glyph('list-bullets');
export const ListChecks = glyph('list-checks');
export const Medal = glyph('medal');
export const PaintBrush = glyph('paint-brush');
export const Pulse = glyph('pulse');
export const SealPercent = glyph('seal-percent');
export const SignOut = glyph('sign-out');
export const Terminal = glyph('terminal');
export const Users = glyph('users');

// No sonnycandra match: Unicon, still outline (regular weight).
export const At = glyph('at');
export const Cards = glyph('cards');
export const Circle = glyph('circle');
export const CircleDashed = glyph('circle-dashed');
export const CircleIcon = glyph('circle');
export const Confetti = glyph('confetti');
export const Gavel = glyph('gavel');
export const LinkBreak = glyph('link-break');
export const TreeStructure = glyph('tree-structure');
export const UserMinus = glyph('user-minus');
export const WifiSlash = glyph('wifi-slash');
