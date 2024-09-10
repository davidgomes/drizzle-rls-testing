import { SQL, sql } from "drizzle-orm";
import {
  AnyPgColumn,
  integer,
  pgTable,
  serial,
  text,
  uuid,
  timestamp,
  pgPolicy,
  pgRole,
  PgRole,
  PgPolicy,
} from "drizzle-orm/pg-core";
/*import {
  authenticatedRole,
  anonymousRole,
  authUid,
  crudPolicy,
} from "drizzle-orm/neon";*/

export const crudPolicy = (
  tableName: string,
  options: {
    role: string | PgRole;
    read?: SQL | boolean;
    modify?: SQL | boolean;
  }
): Array<PgPolicy> => {
  let read: SQL | undefined;
  if (options.read === true) {
    read = sql`select true`;
  } else if (options.read === false) {
    read = sql`select false`;
  } else {
    read = options.read;
  }

  let modify: SQL | undefined;
  if (options.modify === true) {
    modify = sql`select true`;
  } else if (options.modify === false) {
    modify = sql`select false`;
  } else {
    modify = options.modify;
  }

  let policies: Array<PgPolicy> = [];
  if (read) {
    policies.push(
      pgPolicy(`${tableName}-select`, {
        for: "select",
        to: options.role,

        using: modify,
      })
    );
  }

  if (modify) {
    policies.push(
      pgPolicy(`${tableName}-insert`, {
        for: "insert",
        to: options.role,

        withCheck: modify,
      })
    );

    policies.push(
      pgPolicy(`${tableName}-update`, {
        for: "update",
        to: options.role,

        withCheck: modify,
      })
    );

    policies.push(
      pgPolicy(`${tableName}-delete`, {
        for: "delete",
        to: options.role,

        using: modify,
      })
    );
  }

  console.log("policies", policies);
  return policies;
};

// These are default roles that Neon will set up.
export const authenticatedRole = pgRole("authenticated");
export const anonymousRole = pgRole("anonymous");

export const authUid = (userIdColumn: AnyPgColumn) =>
  sql`select auth.user_id() = ${userIdColumn}`;

// core `users` table, this remains private
export const users = pgTable("users", {
  userId: serial("user_id").primaryKey(),
  email: text("email").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: serial("user_id").references(() => users.userId),
    name: text("name"),
  },
  (t) => ({
    first: crudPolicy("user_profiles", {
      role: anonymousRole,
      read: true,
    }),
    second: crudPolicy("user_profiles", {
      role: authenticatedRole,
      read: true,
      modify: authUid(t.userId),
    }),
  })
);

// todo naming with role name
// write and read can be optional

// the messages within a "chat"
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    message: text("message").notNull(),
    chatId: serial("chat_id").references(() => chats.id),
    sender: uuid("sender").notNull(),
  },
  (t) => ({
    f: pgPolicy(`chats-policy-insert`, {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`select auth.user_id() = ${t.sender}`,
    }),

    f1: crudPolicy("chat_messages", {
      role: authenticatedRole,
      read: sql`select auth.user_id() in (select ${chatParticipants.userId} from ${chatParticipants} where ${chatParticipants.chatId} = ${t.chatId})`,
    }),
  })
);

// the users participating in a chat, connecting users and chats tables
export const chatParticipants = pgTable(
  "chat_participants",
  {
    chatId: serial("chat_id").references(() => chats.id),
    userId: serial("user_id").references(() => users.userId),
  },
  (t) => ({
    f: crudPolicy("chat_participants", {
      role: authenticatedRole,
      read: sql`select auth.user_id() in (select ${chatParticipants.userId} from ${chatParticipants} where ${chatParticipants.chatId} = ${t.chatId})`,
    }),
  })
);

export const chats = pgTable(
  "chats",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
  },
  (t) => ({
    f: crudPolicy("chats", {
      role: authenticatedRole,
      read: sql`select auth.user_id() in (select ${chatParticipants.userId} from ${chatParticipants} where ${chatParticipants.chatId} = ${t.id})`,
    }),
  })
);

// `posts` like a simple blog post
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    userId: serial("userId").references(() => users.userId),
  },
  (t) => ({
    // Simple CRUD rules apply here
    q: crudPolicy("posts", {
      role: anonymousRole,
      read: true,
    }),
    // Authenticated users can read / write their own posts
    f: crudPolicy("posts", {
      role: authenticatedRole,
      read: true,
      // checking that the post table `userId` -> `t.userId` is
      // the authenticated user and has access to modify the post
      modify: authUid(t.userId),
    }),
  })
);

// `comments` like simple post comments
export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id").references(() => posts.id),
    content: text("content"),
    userId: uuid("userId"),
  },
  (t) => ({
    // Same CRUD rules as `posts`
    // anyone can read comments
    // authenticated users can create/update/delete their own comments
    q: crudPolicy("comments", {
      role: anonymousRole,
      read: true,
    }),
    f: crudPolicy("comments", {
      role: authenticatedRole,
      read: true,
      modify: authUid(t.userId),
    }),
  })
);
