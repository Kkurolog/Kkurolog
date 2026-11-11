// 멘토 찾기 화면 (주소 "/mentors")
// backend /mentors 에서 멘토 목록을 한 번 받아온 뒤,
// 진로 경로 탭과 검색어로 거르는 일은 화면(프론트)에서 한다. (멘토 수가 적어서 이게 가장 단순하다)
"use client";

import { useEffect, useState } from "react";
import ContactModal from "@/components/ContactModal";
import MentorCard from "@/components/MentorCard";
import { SearchIcon } from "@/components/icons";
import { fetchMentors, type Mentor } from "@/lib/api";

// 진로 경로 탭. "전체" 외의 값은 backend 멘토 데이터의 career_paths 값과 같아야 한다.
const PATH_TABS = ["전체", "대학 진학", "해외 대학", "취업", "창업", "디자인·예술", "개발", "기타 경로"];

// 검색어가 이름·태그·주제·경로 요약 중 하나에 들어 있는지
function matchesSearch(mentor: Mentor, search: string) {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return true;
  const fields = [mentor.name, mentor.path_summary, ...mentor.tags, ...mentor.topics];
  return fields.some((field) => field.toLowerCase().includes(keyword));
}

export default function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("전체"); // 선택한 진로 경로 탭
  const [search, setSearch] = useState(""); // 검색어
  const [contactMentor, setContactMentor] = useState<Mentor | null>(null); // 연락 팝업을 연 멘토 (null 이면 닫힘)

  // 화면이 처음 열릴 때 멘토 목록을 한 번 받아온다
  useEffect(() => {
    fetchMentors()
      .then(setMentors)
      .catch(() => setError("멘토 목록을 가져오지 못했어요. backend 서버가 켜져 있는지 확인해 주세요."))
      .finally(() => setLoading(false));
  }, []);

  // 탭마다 멘토가 몇 명인지 (탭 옆에 숫자로 보여준다)
  function countFor(path: string) {
    return path === "전체" ? mentors.length : mentors.filter((m) => m.career_paths.includes(path)).length;
  }

  const visibleMentors = mentors.filter(
    (mentor) => (tab === "전체" || mentor.career_paths.includes(tab)) && matchesSearch(mentor, search),
  );

  return (
    <main className="flex w-full max-w-[900px] flex-col gap-5 px-5 pt-9 pb-12 sm:px-8">
      <div>
        <h1 className="text-[28px] font-bold text-ink">멘토 찾기</h1>
        <p className="mt-1.5 leading-relaxed text-body">
          참여에 동의한 선배들이에요. 연락처는 공개되지 않고, 첫 연락은 꾸로록이 전달해요.
        </p>
      </div>

      <div className="flex min-h-[52px] items-center gap-2.5 rounded-[14px] border border-line-strong bg-white px-4 focus-within:border-brand">
        <SearchIcon className="size-[18px] shrink-0 text-muted" />
        <label htmlFor="mentor-search" className="sr-only">
          멘토 검색
        </label>
        <input
          id="mentor-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 태그, 주제로 검색 (예: 포트폴리오, 갭이어)"
          className="min-h-12 w-full bg-transparent text-base text-ink placeholder:text-muted focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="진로 경로">
        {PATH_TABS.map((path) => {
          const active = tab === path;
          return (
            <button
              key={path}
              type="button"
              onClick={() => setTab(path)}
              aria-pressed={active}
              className={
                active
                  ? "inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand px-3.5 text-sm font-semibold text-white"
                  : "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm text-body hover:border-brand"
              }
            >
              {path}
              {!loading && <span className={active ? "text-xs text-mint" : "text-xs text-muted"}>{countFor(path)}</span>}
            </button>
          );
        })}
      </div>

      {loading && <p className="text-sm text-muted">불러오는 중...</p>}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && visibleMentors.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-sm text-muted">
          조건에 맞는 멘토가 없어요. 다른 탭이나 검색어를 써 보세요.
        </p>
      )}

      {visibleMentors.length > 0 && (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {visibleMentors.map((mentor) => (
            <MentorCard key={mentor.id} mentor={mentor} onContact={setContactMentor} />
          ))}
        </div>
      )}

      {contactMentor && (
        <ContactModal key={contactMentor.id} mentor={contactMentor} onClose={() => setContactMentor(null)} />
      )}
    </main>
  );
}
