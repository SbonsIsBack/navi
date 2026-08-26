import type { Profile } from '@/lib/db';

interface Props {
  profile: Profile;
  size?: number;
}

/** Avatar: la foto se c'è, altrimenti emoji su fondo colorato. */
export function Avatar({ profile, size = 72 }: Props) {
  const style = {
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${size * 0.5}px`,
    background: profile.avatarPhoto ? 'transparent' : profile.avatarColor,
  };

  return (
    <div class="avatar" style={style} aria-hidden="true">
      {profile.avatarPhoto ? (
        <img src={profile.avatarPhoto} alt="" />
      ) : (
        <span>{profile.avatarEmoji}</span>
      )}
    </div>
  );
}
