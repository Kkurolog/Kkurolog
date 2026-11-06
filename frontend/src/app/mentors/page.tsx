// 멘토 찾기 화면 (주소 "/mentors")
// backend /mentors 에서 멘토 목록을 한 번 받아온 뒤,
// 진로 경로 탭과 검색어로 거르는 일은 화면(프론트)에서 한다. (멘토 수가 적어서 이게 가장 단순하다)
"use client";

import { useEffect, useState } from "react";
import MentorCard from "@/components/MentorCard";
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

  // 화면이 처음 열릴 때 멘토 목록을 한 번 받아온다
  useEffect(() => {
    fetchMentors()
      .then(setMentors)
      .catch(() => setError("멘토 목록을 가져오지 못했어요. backend 서버가 켜져 있는지 확인해 주세요."))
      .finally(() => setLoading(false));
  }, []);

  const visibleMentors = mentors.filter(
    (mentor) => (tab === "전체" || mentor.career_paths.includes(tab)) && matchesSearch(mentor, search),
  );

  function handleContact(mentor: Mentor) {
    // 연락 팝업은 다음 단계에서 연결한다
    alert(`${mentor.name} 선배에게 연락하기 (준비 중)`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">멘토 찾기</h1>
        <p className="mt-1 text-sm text-gray-500">
          참여에 동의한 선배들이에요. 선배의 연락처는 공개되지 않고, 꾸로록이 첫 연락을 전달해요.
        </p>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="이름, 태그, 주제로 검색 (예: 포트폴리오, 갭이어)"
        className="w-full rounded-lg border border-gray-300 p-3 text-base focus:border-indigo-500 focus:outline-none"
      />

      <div className="flex flex-wrap gap-2">
        {PATH_TABS.map((path) => (
          <button
            key={path}
            type="button"
            onClick={() => setTab(path)}
            className={
              tab === path
                ? "rounded-full bg-indigo-600 px-3 py-1 text-sm text-white"
                : "rounded-full bg-white px-3 py-1 text-sm text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
            }
          >
            {path}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-500">불러오는 중...</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && visibleMentors.length === 0 && (
        <p className="text-sm text-gray-500">조건에 맞는 멘토가 없어요. 다른 탭이나 검색어를 써 보세요.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {visibleMentors.map((mentor) => (
          <MentorCard key={mentor.id} mentor={mentor} onContact={handleContact} />
        ))}
      </div>
    </main>
  );
}
