/** فريق المكتب — يظهر فقط عند وجود أعضاء معلنين في اللقطة المنشورة. */
import { Users } from "lucide-react";
import { Chip, Section } from "./primitives";

type Member = {
  name: string;
  title: string;
  bio: string;
  photoUrl: string;
  specialties: string[];
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function OfficePublicTeam({ team }: { team: Member[] }) {
  return (
    <Section titleId="team-title" title="فريق المكتب" icon={Users}>
      <ul className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {team.map((member) => (
          <li key={member.name + member.title} className="h-full">
            <div className="office-card h-full p-5 shadow-xs">
              <div className="flex items-center gap-3">
                {member.photoUrl ? (
                  <img
                    src={member.photoUrl}
                    alt={member.name}
                    width={112}
                    height={112}
                    loading="lazy"
                    decoding="async"
                    className="size-14 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/8 text-h4 text-primary"
                  >
                    {initials(member.name)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-h4 break-words">{member.name}</p>
                  {member.title && (
                    <p className="mt-0.5 text-body-sm break-words text-muted-foreground">
                      {member.title}
                    </p>
                  )}
                </div>
              </div>
              {member.bio && (
                <p className="mt-3 text-body-sm break-words text-muted-foreground">{member.bio}</p>
              )}
              {member.specialties.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {member.specialties.map((item) => (
                    <li key={item}>
                      <Chip>{item}</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
