import { useParams } from 'react-router-dom';
import { Page } from '../components/Page';
import { useLoad } from '../hooks/useApi';
import { api } from '../lib/api';
import type { ExamDetail, PeersView, QuestionInsight, StaffExamDetail, StudentExamDetail } from '../lib/types';
import { StudentExam } from './StudentExam';
import { TeacherExam } from './TeacherExam';

type Loaded = { role: 'staff'; detail: StaffExamDetail; insights: QuestionInsight[] } | { role: 'student'; detail: StudentExamDetail; peers: PeersView };

export function ExamPage() {
  const { id } = useParams();
  const load = useLoad<Loaded>(`exam:${id}`, async () => {
    const detail = await api<ExamDetail>(`/exams/${id}`);
    if (detail.role === 'staff') {
      const { questions } = await api<{ questions: QuestionInsight[] }>(`/exams/${id}/insights`);
      return { role: 'staff', detail, insights: questions };
    }
    return { role: 'student', detail, peers: await api<PeersView>(`/exams/${id}/peers`) };
  });
  return (
    <Page load={load} active="exams" title={(d) => d.detail.exam.title} crumbs={(d) => [[d.role === 'staff' ? 'Exams' : 'My exams', '#/exams']]}>
      {(d) =>
        d.role === 'staff' ? (
          <TeacherExam data={d.detail} insights={d.insights} reload={load.reload} />
        ) : (
          <StudentExam data={d.detail} peers={d.peers} reload={load.reload} />
        )
      }
    </Page>
  );
}
