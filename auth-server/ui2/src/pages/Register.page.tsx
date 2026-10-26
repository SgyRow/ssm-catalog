import {
  Container,
  Paper,
  Text,
  Title
} from '@mantine/core';
import { Navigate } from 'react-router-dom';

import DBRegister from "@/components/DBRegister/DBRegister";
import { get_runtime_config } from '@/RuntimeConfig';

export function RegisterPage() {
  const config = get_runtime_config();
  if (config?.registration_enabled === false) {
    return <Navigate to="/" replace />;
  }

  return (
    <Container size={480} my={100}>
      <Title ta="center">
        Papermerge DMS
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Open Source Document Management System for Digital Archives
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <DBRegister />
      </Paper>
    </Container>
  );
}
