// 멘토 리스트 화면 (주소 "/mentors", 와이어프레임 03-1)
// backend /mentors 에서 참여에 동의한 멘토 목록을 받아와 한 줄에 4명씩 카드로 보여준다.
// 멘토가 늘면 아래로 줄이 추가된다. 카드의 메일 버튼을 누르면 메일 작성 창(ContactModal)이 열린다.
"use client";

import { useEffect, useState } from "react";
import ContactModal from "@/components/ContactModal";
import MentorCard from "@/components/MentorCard";
import { fetchMentors, type Mentor } from "@/lib/api";

export default function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactMentor, setContactMentor] = useState<Mentor | null>(null); // 메일 창을 연 멘토 (null 이면 닫힘)

  // 화면이 처음 열릴 때 멘토 목록을 한 번 받아온다
  useEffect(() => {
    fetchMentors()
      .then(setMentors)
      .catch(() => setError("멘토 목록을 가져오지 못했어요. backend 서버가 켜져 있는지 확인해 주세요."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="w-full px-6 pt-16 pb-20 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1048px] flex-col gap-12">
        <h1 className="font-display text-[36px] leading-[48px] text-brand">멘토 찾아보기</h1>

        {loading && <p className="text-sm text-muted">불러오는 중...</p>}
        {error && (
          <p role="alert" className="border-l-4 border-danger pl-4 text-[15px] text-ink">
            {error}
          </p>
        )}
        {!loading && !error && mentors.length === 0 && (
          <p className="text-[15px] text-muted">아직 참여한 멘토가 없어요.</p>
        )}

        {mentors.length > 0 && (
          <div className="grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {mentors.map((mentor) => (
              <MentorCard key={mentor.id} mentor={mentor} onContact={setContactMentor} />
            ))}
          </div>
        )}
      </div>

      {contactMentor && (
        <ContactModal key={contactMentor.id} mentor={contactMentor} onClose={() => setContactMentor(null)} />
      )}
    </main>
  );
}
