import { clientRepository } from "../repositories/client.repository.js";

// The service is the domain entry point for Client, Project, and dashboard flows.
// Repository methods perform authorization-independent data validation and
// transactional writes; route middleware owns role and CSRF enforcement.
export const clientService = {
  list: clientRepository.list.bind(clientRepository),
  get: clientRepository.get.bind(clientRepository),
  create: clientRepository.create.bind(clientRepository),
  update: clientRepository.update.bind(clientRepository),
  status: clientRepository.status.bind(clientRepository),
  projects: clientRepository.projects.bind(clientRepository),
  estimates: clientRepository.estimates.bind(clientRepository),
  activity: clientRepository.activity.bind(clientRepository),
  createProject: clientRepository.createProject.bind(clientRepository),
  getProject: clientRepository.getProject.bind(clientRepository),
  updateProject: clientRepository.updateProject.bind(clientRepository),
  statusProject: clientRepository.statusProject.bind(clientRepository),
  dashboard: clientRepository.dashboard.bind(clientRepository),
};
